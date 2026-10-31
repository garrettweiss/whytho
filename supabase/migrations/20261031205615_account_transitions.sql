BEGIN;
-- Private append-only operational history. No message body or email is logged.
CREATE TABLE IF NOT EXISTS public.politician_account_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  subject_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.politician_account_audit ENABLE ROW LEVEL SECURITY;
-- Supabase defaults grant service_role ALL; explicitly narrow this ledger too.
REVOKE ALL ON public.politician_account_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.politician_account_audit TO service_role;
ALTER TABLE public.answers ADD COLUMN IF NOT EXISTS published_at timestamptz;
-- Serialize claim and team changes on the profile row. API routes call these
-- service-only functions with the authenticated actor; browser roles cannot.
-- The definer owns auth.users access; the service role receives no broad auth grant.
-- Every referenced application table/type is schema-qualified and the search path
-- contains only pg_catalog. Trusted API code must bind p_actor_id to getUser().
-- No existing rows are changed by this migration.
CREATE OR REPLACE FUNCTION public.claim_politician_profile(p_actor_id uuid, p_politician_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE person record; membership record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_actor_id AND is_anonymous IS NOT TRUE)
  THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('profile-claim:'||p_actor_id::text,0));
  SELECT id, full_name, slug, verification_tier INTO person FROM public.politicians
    WHERE id=p_politician_id AND is_active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Politician not found' USING ERRCODE='P0002'; END IF;
  SELECT id, role INTO membership FROM public.politician_team
    WHERE politician_id=p_politician_id AND user_id=p_actor_id;
  IF FOUND THEN
    IF membership.role <> 'admin' THEN RAISE EXCEPTION 'Only a team admin can resume a claim' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('success',true,'politician_id',person.id,'politician_name',person.full_name,'politician_slug',person.slug,'verification_tier',person.verification_tier,'resumed',true);
  END IF;
  IF person.verification_tier <> '0' OR EXISTS (SELECT 1 FROM public.politician_team WHERE politician_id=p_politician_id)
  THEN RAISE EXCEPTION 'This profile has already been claimed' USING ERRCODE='23505'; END IF;
  IF (SELECT count(*) FROM public.politician_team t JOIN public.politicians p ON p.id=t.politician_id WHERE t.user_id=p_actor_id AND t.role='admin' AND p.verification_tier='1')>=5
  THEN RAISE EXCEPTION 'Complete verification of your existing claims before claiming more profiles. Contact support for help.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.politician_team (politician_id,user_id,role,invited_by) VALUES (p_politician_id,p_actor_id,'admin',p_actor_id);
  UPDATE public.politicians SET verification_tier='1' WHERE id=p_politician_id;
  INSERT INTO public.politician_account_audit(politician_id,actor_id,action,subject_id) VALUES(p_politician_id,p_actor_id,'claim',p_actor_id);
  RETURN jsonb_build_object('success',true,'politician_id',person.id,'politician_name',person.full_name,'politician_slug',person.slug,'verification_tier','1','resumed',false);
END;
$function$;
ALTER FUNCTION public.claim_politician_profile(uuid,uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.claim_politician_profile(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_politician_profile(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.manage_politician_team(
  p_actor_id uuid, p_politician_id uuid, p_action text,
  p_member_id uuid DEFAULT NULL, p_email text DEFAULT NULL, p_role text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE actor record; target record; invitee record; member_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_actor_id AND is_anonymous IS NOT TRUE)
  THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.politicians WHERE id=p_politician_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Politician not found' USING ERRCODE='P0002'; END IF;
  SELECT id, role INTO actor FROM public.politician_team WHERE politician_id=p_politician_id AND user_id=p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a team member' USING ERRCODE='42501'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('add','role','remove','disconnect')
  THEN RAISE EXCEPTION 'Invalid team action' USING ERRCODE='22023'; END IF;
  IF p_action <> 'disconnect' AND actor.role <> 'admin'
  THEN RAISE EXCEPTION 'Only team admins can manage members' USING ERRCODE='42501'; END IF;
  IF p_action IN ('add','role') AND (p_role IS NULL OR p_role NOT IN ('admin','editor','responder'))
  THEN RAISE EXCEPTION 'Invalid team role' USING ERRCODE='22023'; END IF;
  IF p_action='add' THEN
    IF p_email IS NULL OR length(trim(p_email))>254 OR trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'A valid account email is required' USING ERRCODE='22023'; END IF;
    SELECT id,email INTO invitee FROM auth.users WHERE lower(email)=lower(trim(p_email)) AND is_anonymous IS NOT TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No WhyTho account found. Ask them to sign up first.' USING ERRCODE='P0002'; END IF;
    IF EXISTS (SELECT 1 FROM public.politician_team WHERE politician_id=p_politician_id AND user_id=invitee.id)
    THEN RAISE EXCEPTION 'That person is already on the team' USING ERRCODE='23505'; END IF;
    IF (SELECT count(*) FROM public.politician_team WHERE politician_id=p_politician_id)>=100
    THEN RAISE EXCEPTION 'Team limit reached. Contact WhyTho support.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.politician_team (politician_id,user_id,role,invited_by)
      VALUES(p_politician_id,invitee.id,p_role::public.politician_team_role,p_actor_id) RETURNING id INTO member_id;
    INSERT INTO public.politician_account_audit(politician_id,actor_id,action,subject_id,details) VALUES(p_politician_id,p_actor_id,'team_add',invitee.id,jsonb_build_object('role',p_role));
    RETURN jsonb_build_object('success',true,'member_id',member_id,'email',invitee.email,'role',p_role);
  END IF;
  SELECT id,user_id,role INTO target FROM public.politician_team
    WHERE politician_id=p_politician_id AND id=CASE WHEN p_action='disconnect' THEN actor.id ELSE p_member_id END;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team member not found on this profile' USING ERRCODE='P0002'; END IF;
  IF target.role='admin' AND (p_action <> 'role' OR p_role <> 'admin')
    AND (SELECT count(*) FROM public.politician_team WHERE politician_id=p_politician_id AND role='admin')<=1
  THEN RAISE EXCEPTION 'Add another admin before removing or changing the last admin. Contact support to release a claim.' USING ERRCODE='22023'; END IF;
  IF p_action='role' THEN
    UPDATE public.politician_team SET role=p_role::public.politician_team_role WHERE id=target.id AND politician_id=p_politician_id;
  ELSE
    DELETE FROM public.politician_team WHERE id=target.id AND politician_id=p_politician_id;
  END IF;
  INSERT INTO public.politician_account_audit(politician_id,actor_id,action,subject_id,details) VALUES(p_politician_id,p_actor_id,'team_'||p_action,target.user_id,jsonb_build_object('previous_role',target.role,'new_role',CASE WHEN p_action='role' THEN p_role ELSE NULL END));
  RETURN jsonb_build_object('success',true,'member_id',target.id);
END;
$function$;
ALTER FUNCTION public.manage_politician_team(uuid,uuid,text,uuid,text,text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.manage_politician_team(uuid,uuid,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_politician_team(uuid,uuid,text,uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';

-- Keep role checks and the write in one transaction. A question lock serializes
-- publishing so two approved drafts cannot become competing official answers.
CREATE OR REPLACE FUNCTION public.save_politician_answer(
  p_actor_id uuid, p_action text, p_question_id uuid DEFAULT NULL,
  p_answer_id uuid DEFAULT NULL, p_body text DEFAULT NULL, p_sources jsonb DEFAULT '[]'::jsonb,
  p_requested_type text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE q record; response record; person record; actor_role public.politician_team_role; draft boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_actor_id AND is_anonymous IS NOT TRUE)
  THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('create','edit','approve') THEN RAISE EXCEPTION 'Invalid answer action' USING ERRCODE='22023'; END IF;
  IF p_action <> 'approve' AND (p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 10 AND 5000)
  THEN RAISE EXCEPTION 'Response must be 10 to 5000 characters' USING ERRCODE='22023'; END IF;
  IF p_action <> 'create' THEN
    SELECT question_id INTO response FROM public.answers WHERE id=p_answer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Answer not found' USING ERRCODE='P0002'; END IF;
    p_question_id := response.question_id;
  END IF;
  SELECT politician_id INTO q FROM public.questions WHERE id=p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found' USING ERRCODE='P0002'; END IF;
  SELECT verification_tier INTO person FROM public.politicians WHERE id=q.politician_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE;
  SELECT role INTO actor_role FROM public.politician_team WHERE politician_id=q.politician_id AND user_id=p_actor_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized for this politician' USING ERRCODE='42501'; END IF;
  IF p_action='create' THEN
    IF q.status <> 'active' THEN RAISE EXCEPTION 'Question is no longer active' USING ERRCODE='22023'; END IF;
    IF p_requested_type='direct' AND actor_role='responder' THEN RAISE EXCEPTION 'Responders must submit drafts for review' USING ERRCODE='42501'; END IF;
    IF p_sources IS NULL OR jsonb_typeof(p_sources) <> 'array' OR jsonb_array_length(p_sources)>20
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_sources) value WHERE jsonb_typeof(value)<>'string')
    THEN RAISE EXCEPTION 'Invalid sources' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.answers WHERE question_id=q.id AND is_draft=false AND is_ai_generated=false AND answer_type IN ('direct','team_statement'))
    THEN RAISE EXCEPTION 'This question already has an official answer' USING ERRCODE='23505'; END IF;
    draft := person.verification_tier NOT IN ('2','3') OR actor_role='responder' OR (p_requested_type='team_statement') IS TRUE;
    INSERT INTO public.answers(question_id,politician_id,week_number,body,sources,answer_type,is_draft,is_ai_generated,is_disputed,published_by,published_at)
    VALUES(q.id,q.politician_id,q.week_number,trim(p_body),p_sources,CASE WHEN draft THEN 'team_statement'::public.answer_type ELSE 'direct'::public.answer_type END,draft,false,false,p_actor_id,CASE WHEN draft THEN NULL ELSE now() END)
    RETURNING * INTO response;
  ELSE
    SELECT * INTO response FROM public.answers WHERE id=p_answer_id AND politician_id=q.politician_id AND question_id=q.id FOR UPDATE;
    IF NOT FOUND OR response.is_ai_generated OR response.answer_type NOT IN ('direct','team_statement')
    THEN RAISE EXCEPTION 'Only human official responses can be changed' USING ERRCODE='42501'; END IF;
    IF p_action='approve' THEN
      IF actor_role NOT IN ('admin','editor') OR person.verification_tier NOT IN ('2','3')
      THEN RAISE EXCEPTION 'A verified team admin or editor must approve responses' USING ERRCODE='42501'; END IF;
      IF NOT response.is_draft THEN RAISE EXCEPTION 'Answer is already published' USING ERRCODE='23505'; END IF;
      IF q.status <> 'active' THEN RAISE EXCEPTION 'Question is no longer active' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM public.answers WHERE question_id=q.id AND is_draft=false AND is_ai_generated=false AND answer_type IN ('direct','team_statement'))
      THEN RAISE EXCEPTION 'This question already has an official answer' USING ERRCODE='23505'; END IF;
      UPDATE public.answers SET is_draft=false,published_at=now() WHERE id=p_answer_id RETURNING * INTO response;
    ELSE
      IF actor_role='responder' AND (NOT response.is_draft OR response.published_by IS DISTINCT FROM p_actor_id)
      THEN RAISE EXCEPTION 'Responders may only edit their own private drafts' USING ERRCODE='42501'; END IF;
      IF NOT response.is_draft THEN
        IF person.verification_tier NOT IN ('2','3') THEN RAISE EXCEPTION 'Verify this profile before editing published responses' USING ERRCODE='42501'; END IF;
        IF coalesce(response.published_at,response.created_at) < now()-interval '15 minutes' THEN RAISE EXCEPTION 'The 15-minute edit window has closed' USING ERRCODE='22023'; END IF;
      END IF;
      UPDATE public.answers SET body=trim(p_body) WHERE id=p_answer_id RETURNING * INTO response;
    END IF;
  END IF;
  INSERT INTO public.politician_account_audit(politician_id,actor_id,action,subject_id,details) VALUES(q.politician_id,p_actor_id,'answer_'||p_action,response.id,jsonb_build_object('is_draft',response.is_draft,'question_id',q.id));
  RETURN jsonb_build_object('success',true,'answer_id',response.id,'answer_type',response.answer_type,'is_draft',response.is_draft);
END;
$function$;
ALTER FUNCTION public.save_politician_answer(uuid,text,uuid,uuid,text,jsonb,text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.save_politician_answer(uuid,text,uuid,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_politician_answer(uuid,text,uuid,uuid,text,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
