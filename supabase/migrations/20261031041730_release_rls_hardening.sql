-- WhyTho release boundary: public answers, private drafts, and current-week votes.
-- No records or policies are deleted. Existing service-role application paths remain.
-- Apply with the migration runner as one transaction after the local fixture tests.

DO $guard$
DECLARE policy_set record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid IN ('public.answers'::regclass, 'public.answer_media'::regclass,
      'public.votes'::regclass, 'public.questions'::regclass, 'public.politician_team'::regclass,
      'public.politicians'::regclass, 'public.politician_verifications'::regclass, 'storage.objects'::regclass)
      AND NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION 'Release preflight: a protected table has RLS disabled'; END IF;
  -- Fingerprints include policy names, commands, roles, USING and WITH CHECK.
  -- Accept only the audited live baseline, this exact release, or its tested
  -- rollback equivalent (votes UPDATE gains an explicit ownership WITH CHECK).
  FOR policy_set IN
    SELECT * FROM (VALUES
      ('public','answer_media',ARRAY['ce8b32112157ab543242ed7eae6d1008','d6215a238a756d3cdcd8af580b35a9b1']),
      ('public','answers',ARRAY['491464ec89f70cb5c747dc85d033cb2b','32c7ddc50322fedb622e0756fe28d193']),
      ('public','politician_verifications',ARRAY['c4bfca7c200f3e0ef0c3ac1f84686706']),
      ('public','questions',ARRAY['0f96fb80307397dc572682edea035c4d']),
      ('public','votes',ARRAY['33b499d52ded2b0a4192ea1519c73ef4','bb9196a744c7cd319d1fe4e19f3a9682','6b2860f23f139ee2acb1c8f3cdde6b79']),
      ('public','politician_team',ARRAY['255f610fd6aa4b68217599a79459cfdc']),
      ('public','politicians',ARRAY['2380567a8633f15376a1ff726fd379a4']),
      ('storage','objects',ARRAY['d755cd8150f9acebd9b5777f93a72c08','61326982f49ecee60346bcc244461e3e'])
    ) AS expected(schema_name,table_name,fingerprints)
  LOOP
    IF NOT coalesce((SELECT pg_catalog.md5(pg_catalog.string_agg(
      policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),
      E'\n' ORDER BY policyname)) = ANY(policy_set.fingerprints)
      FROM pg_catalog.pg_policies WHERE schemaname=policy_set.schema_name AND tablename=policy_set.table_name),false)
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname=policy_set.schema_name AND tablename=policy_set.table_name AND permissive<>'PERMISSIVE')
    THEN RAISE EXCEPTION 'Release preflight: %.% policies changed; review before applying',policy_set.schema_name,policy_set.table_name; END IF;
  END LOOP;
  -- Table REVOKE does not remove independent column grants. Only the exact safe
  -- resume column grants introduced below are allowed on a repeat application.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute attribute
    JOIN pg_catalog.pg_class relation ON relation.oid=attribute.attrelid
    JOIN pg_catalog.pg_namespace schema ON schema.oid=relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) permission
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=permission.grantee
    WHERE schema.nspname='public' AND relation.relname IN ('questions','politician_verifications')
      AND (permission.grantee=0 OR grantee.rolname IN ('anon','authenticated'))
      AND permission.privilege_type IN ('INSERT','UPDATE','SELECT')
      AND NOT (relation.relname='politician_verifications' AND grantee.rolname='authenticated'
        AND permission.privilege_type='SELECT' AND attribute.attname IN ('id','user_id','politician_id','method','status'))
  ) THEN RAISE EXCEPTION 'Release preflight: unexpected independent column grants'; END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='answer-media' AND public)
  THEN RAISE EXCEPTION 'Release preflight: answer-media already exists as public; review its assets'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='public.votes'::regclass AND tgname='votes_update_net_upvotes'
      AND tgfoid='public.update_question_net_upvotes()'::regprocedure AND tgenabled='O'
  ) THEN RAISE EXCEPTION 'Release preflight: vote tally trigger differs from the audited trigger'; END IF;
END;
$guard$;

-- Current membership is required even for the original author of a draft.
-- team_own_read only depends on auth.uid(), so this does not create an RLS cycle.
ALTER POLICY answers_public_read ON public.answers USING (
  is_draft = false OR EXISTS (
    SELECT 1 FROM public.politician_team AS team
    WHERE team.politician_id = answers.politician_id
      AND team.user_id = (SELECT auth.uid())
      AND (team.role IN ('admin', 'editor')
        OR (team.role = 'responder' AND answers.published_by = (SELECT auth.uid())))
  )
);

-- Media inherits its answer's visibility. A mismatched politician cannot expose it.
ALTER POLICY answer_media_public_read ON public.answer_media USING (
  EXISTS (SELECT 1 FROM public.answers AS answer
    WHERE answer.id = answer_media.answer_id
      AND answer.politician_id = answer_media.politician_id)
);
-- Metadata writes must use the application's authenticated, role-checked API.
ALTER POLICY answer_media_team_insert ON public.answer_media WITH CHECK (false);
ALTER POLICY answer_media_team_delete ON public.answer_media USING (false);

-- Existing policies are kept, but clients cannot bypass the upload API.
ALTER POLICY answer_media_auth_insert ON storage.objects WITH CHECK (false);
ALTER POLICY answer_media_auth_delete ON storage.objects USING (false);
-- Delivery signs with service role after checking answer_media RLS in the API.
-- Deny raw client reads too: otherwise members can mint longer-lived draft URLs.
ALTER POLICY answer_media_public_read ON storage.objects USING (false);
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('answer-media', 'answer-media', false, 4194304, ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'
])
ON CONFLICT (id) DO NOTHING;

-- Vote ownership and the actual question cohort are checked on old and new rows.
-- votes has no politician_id column: its question FK is the politician binding.
ALTER POLICY votes_own_insert ON public.votes WITH CHECK (
  user_id = (SELECT auth.uid())
  AND week_number = (SELECT public.current_week_number())
  AND EXISTS (SELECT 1 FROM public.questions AS question
    WHERE question.id = votes.question_id AND question.status = 'active'
      AND question.week_number = votes.week_number)
);
ALTER POLICY votes_own_update ON public.votes USING (
  user_id = (SELECT auth.uid())
  AND week_number = (SELECT public.current_week_number())
  AND EXISTS (SELECT 1 FROM public.questions AS question
    WHERE question.id = votes.question_id AND question.status = 'active'
      AND question.week_number = votes.week_number)
) WITH CHECK (
  user_id = (SELECT auth.uid())
  AND week_number = (SELECT public.current_week_number())
  AND EXISTS (SELECT 1 FROM public.questions AS question
    WHERE question.id = votes.question_id AND question.status = 'active'
      AND question.week_number = votes.week_number)
);
ALTER POLICY votes_own_delete ON public.votes USING (
  user_id = (SELECT auth.uid())
  AND week_number = (SELECT public.current_week_number())
  AND EXISTS (SELECT 1 FROM public.questions AS question
    WHERE question.id = votes.question_id AND question.status = 'active'
      AND question.week_number = votes.week_number)
);

-- The application already creates/moderates questions through service-role routes.
-- Remove direct client paths that allow forged scores, authors, and archive moves.
REVOKE INSERT, UPDATE ON public.questions FROM PUBLIC, anon, authenticated;

-- Verification status and OTPs are server-owned. Resume uses only these columns.
REVOKE INSERT, UPDATE, SELECT ON public.politician_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, politician_id, method, status)
  ON public.politician_verifications TO authenticated;

-- Keep the existing trigger object and function signature. A definer is necessary:
-- a voter normally has no right to update another citizen's question.
CREATE OR REPLACE FUNCTION public.update_question_net_upvotes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  target_question uuid;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'votes'
    OR TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'Vote tally function is only valid on the votes trigger' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' AND
    ROW(NEW.id, NEW.user_id, NEW.question_id, NEW.week_number, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.question_id, OLD.week_number, OLD.created_at)
  THEN RAISE EXCEPTION 'Vote identity is immutable' USING ERRCODE='23514'; END IF;

  target_question := CASE WHEN TG_OP = 'DELETE' THEN OLD.question_id ELSE NEW.question_id END;
  -- Recheck after locking to prevent a concurrent moderation/cohort change from
  -- accepting a client vote against a question that just became ineligible.
  -- current_setting('role') retains SET ROLE inside a SECURITY DEFINER function.
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    PERFORM 1 FROM public.questions AS question
    WHERE question.id = target_question AND question.status = 'active'
      AND question.week_number = public.current_week_number()
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Question is not open for voting' USING ERRCODE='42501'; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    UPDATE public.questions SET net_upvotes = net_upvotes + NEW.value WHERE id = NEW.question_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.questions SET net_upvotes = net_upvotes - OLD.value WHERE id = OLD.question_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.questions SET net_upvotes = net_upvotes - OLD.value + NEW.value WHERE id = NEW.question_id;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.update_question_net_upvotes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_question_net_upvotes() TO service_role;

-- Publication is a database trust boundary even for service-role API writes.
-- Lock the profile so concurrent verification changes cannot race this check.
CREATE OR REPLACE FUNCTION public.enforce_official_answer_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.is_draft = false AND NEW.is_ai_generated = false
    AND NEW.answer_type IN ('direct', 'team_statement') THEN
    PERFORM 1 FROM public.politicians
      WHERE id=NEW.politician_id AND verification_tier IN ('2','3') FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Identity verification is required to publish an official response' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.enforce_official_answer_verification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_official_answer_verification() TO service_role;
CREATE OR REPLACE TRIGGER answers_require_verified_identity
  BEFORE INSERT OR UPDATE ON public.answers FOR EACH ROW
  EXECUTE FUNCTION public.enforce_official_answer_verification();

-- Atomically authorize metadata attachment against approval/revocation races.
-- Service-only invoker: no new privilege bypass and no client-callable RPC.
CREATE OR REPLACE FUNCTION public.attach_answer_media(
  p_actor_id uuid, p_answer_id uuid, p_media_id uuid, p_storage_path text,
  p_media_type text, p_public_url text, p_file_name text,
  p_file_size_bytes integer, p_mime_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
DECLARE
  answer_row record;
  actor_role public.politician_team_role;
BEGIN
  SELECT id, politician_id, published_by, is_draft, is_ai_generated, answer_type
    INTO answer_row FROM public.answers WHERE id=p_answer_id FOR UPDATE;
  IF NOT FOUND OR answer_row.is_ai_generated OR answer_row.answer_type NOT IN ('direct','team_statement')
  THEN RAISE EXCEPTION 'Response is not eligible for attachments' USING ERRCODE='42501'; END IF;
  SELECT role INTO actor_role FROM public.politician_team
    WHERE politician_id=answer_row.politician_id AND user_id=p_actor_id FOR SHARE;
  IF NOT FOUND OR NOT (actor_role IN ('admin','editor') OR
    (actor_role='responder' AND answer_row.is_draft AND answer_row.published_by=p_actor_id))
  THEN RAISE EXCEPTION 'Current role or response status does not allow this attachment' USING ERRCODE='42501'; END IF;
  IF answer_row.is_draft = false THEN
    PERFORM 1 FROM public.politicians WHERE id=answer_row.politician_id
      AND verification_tier IN ('2','3') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Identity verification is required for published response media' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_media_id IS NULL OR p_media_type IS NULL OR p_media_type NOT IN ('image','video','audio')
    OR p_file_size_bytes IS NULL OR p_file_size_bytes NOT BETWEEN 1 AND 4194304
    OR p_mime_type IS NULL OR p_mime_type NOT IN (
      'image/jpeg','image/png','image/webp','image/heic','image/gif',
      'video/mp4','video/quicktime','video/webm',
      'audio/mpeg','audio/wav','audio/mp4','audio/ogg','audio/x-m4a')
    OR split_part(p_mime_type,'/',1) <> p_media_type
    OR p_public_url IS DISTINCT FROM ('/api/answer-media/' || p_media_id::text)
    OR p_storage_path IS NULL OR length(p_storage_path)>1024
    OR split_part(p_storage_path,'/',1) <> answer_row.politician_id::text
    OR split_part(p_storage_path,'/',2) <> p_answer_id::text
    OR array_length(string_to_array(p_storage_path,'/'),1) <> 3
    OR split_part(p_storage_path,'/',3) !~ '^[0-9a-f-]{36}\.[a-z0-9-]+$'
    OR position('..' in p_storage_path)>0
  THEN RAISE EXCEPTION 'Invalid attachment metadata' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.answer_media WHERE answer_id=p_answer_id)>=5
  THEN RAISE EXCEPTION 'A response can have at most five attachments' USING ERRCODE='22023'; END IF;
  INSERT INTO public.answer_media (id,answer_id,politician_id,media_type,storage_path,public_url,file_name,file_size_bytes,mime_type)
  VALUES (p_media_id,p_answer_id,answer_row.politician_id,p_media_type,p_storage_path,p_public_url,p_file_name,p_file_size_bytes,p_mime_type);
  RETURN p_media_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.attach_answer_media(uuid,uuid,uuid,text,text,text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_answer_media(uuid,uuid,uuid,text,text,text,text,integer,text) TO service_role;

NOTIFY pgrst, 'reload schema';
