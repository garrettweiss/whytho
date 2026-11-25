BEGIN;

-- Keep historical duplicates intact for review, while preventing new ones.
CREATE OR REPLACE FUNCTION public.enforce_x_post_single_question()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.x_post_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.x_post_id IS NOT DISTINCT FROM OLD.x_post_id THEN RETURN NEW; END IF;
  PERFORM id FROM public.x_posts WHERE id=NEW.x_post_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'X source unavailable' USING ERRCODE='23503'; END IF;
  IF EXISTS(SELECT 1 FROM public.questions WHERE x_post_id=NEW.x_post_id AND id<>NEW.id) THEN
    RAISE EXCEPTION 'X source already has a question' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.enforce_x_post_single_question() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_x_post_single_question() FROM PUBLIC,anon,authenticated,service_role;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.questions'::regclass
    AND tgname='x_post_single_question' AND NOT tgisinternal) THEN
    CREATE TRIGGER x_post_single_question BEFORE INSERT OR UPDATE OF x_post_id ON public.questions
      FOR EACH ROW EXECUTE FUNCTION public.enforce_x_post_single_question();
  END IF;
  IF EXISTS(SELECT 1 FROM public.questions WHERE x_post_id IS NOT NULL GROUP BY x_post_id HAVING count(*)>1) THEN
    RAISE NOTICE 'Existing duplicate X question bindings retained. Unique index deferred for reviewed reconciliation; insertion guard is active.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS questions_one_x_post_idx ON public.questions(x_post_id) WHERE x_post_id IS NOT NULL;
  END IF;
END $$;

-- Service role already has table privileges. Invoker mode preserves those controls.
CREATE OR REPLACE FUNCTION public.publish_x_post(p_x_post_id uuid,p_body text,p_week_number integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  post public.x_posts%ROWTYPE;
  question public.questions%ROWTYPE;
  identity jsonb;
  canonical_id uuid;
  source_id uuid;
  matching_count integer;
  was_created boolean:=false;
BEGIN
  -- Match identity linking and the question trigger before taking row locks.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('whytho:politician-identities',0));
  SELECT * INTO post FROM public.x_posts WHERE id=p_x_post_id;
  IF NOT FOUND OR post.politician_id IS NULL THEN
    RAISE EXCEPTION 'X publication source unavailable' USING ERRCODE='22023';
  END IF;
  identity:=public.resolve_politician_identity(post.politician_id);
  canonical_id:=(identity->>'canonical_id')::uuid;
  source_id:=post.politician_id;
  IF canonical_id IS NULL THEN RAISE EXCEPTION 'X publication identity unavailable' USING ERRCODE='22023'; END IF;
  -- Serialize with identity changes; the question insert trigger resolves again.
  PERFORM id FROM public.politicians WHERE id IN(post.politician_id,canonical_id) ORDER BY id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.politicians WHERE id=canonical_id AND canonical_politician_id IS NULL AND is_active AND NOT is_test)
    OR EXISTS(SELECT 1 FROM public.politicians WHERE id=source_id AND is_test) THEN
    RAISE EXCEPTION 'X publication identity is not eligible' USING ERRCODE='22023';
  END IF;
  identity:=public.resolve_politician_identity(post.politician_id);
  IF (identity->>'canonical_id')::uuid IS DISTINCT FROM canonical_id THEN
    RAISE EXCEPTION 'Identity changed; retry publication' USING ERRCODE='40001';
  END IF;
  -- Match the question trigger lock order: politician identity, then X post.
  SELECT * INTO post FROM public.x_posts WHERE id=p_x_post_id FOR UPDATE;
  IF NOT FOUND OR post.politician_id IS DISTINCT FROM source_id THEN
    RAISE EXCEPTION 'X source changed; retry publication' USING ERRCODE='40001';
  END IF;
  SELECT count(*) INTO matching_count FROM public.questions WHERE x_post_id=post.id;
  IF matching_count>1 THEN RAISE EXCEPTION 'Multiple questions for X source require review' USING ERRCODE='23505'; END IF;
  IF post.whytho_question_id IS NOT NULL THEN
    SELECT * INTO question FROM public.questions WHERE id=post.whytho_question_id;
    IF NOT FOUND OR question.x_post_id IS DISTINCT FROM post.id OR question.source<>'x'
      OR public.canonical_politician_id(question.politician_id) IS DISTINCT FROM canonical_id THEN
      RAISE EXCEPTION 'Existing X publication binding requires review' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('question_id',question.id,'canonical_id',canonical_id,'published',false);
  END IF;
  IF post.status<>'approved' THEN RAISE EXCEPTION 'X post is not approved for publication' USING ERRCODE='22023'; END IF;
  IF matching_count=1 THEN
    -- Recover a legacy partial write without replacing its body, ID or attribution.
    SELECT * INTO question FROM public.questions WHERE x_post_id=post.id;
    IF question.source<>'x' OR public.canonical_politician_id(question.politician_id) IS DISTINCT FROM canonical_id THEN
      RAISE EXCEPTION 'Existing X question identity requires review' USING ERRCODE='22023';
    END IF;
  ELSE
    IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 10 AND 500
      OR p_week_number IS DISTINCT FROM public.current_week_number() THEN
      RAISE EXCEPTION 'Invalid X question body or reporting week' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.questions(politician_id,week_number,body,source,is_seeded,submitted_by,x_post_id,status,net_upvotes)
      VALUES(canonical_id,p_week_number,btrim(p_body),'x',false,NULL,post.id,'active',0)
      RETURNING * INTO question;
    was_created:=true;
  END IF;
  UPDATE public.x_posts SET whytho_question_id=question.id,status='published',updated_at=now() WHERE id=post.id;
  RETURN jsonb_build_object('question_id',question.id,'canonical_id',canonical_id,'published',was_created);
END $$;
ALTER FUNCTION public.publish_x_post(uuid,text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_x_post(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_x_post(uuid,text,integer) TO service_role;
COMMENT ON FUNCTION public.publish_x_post(uuid,text,integer) IS
  'Atomic approved-X-post publication. Keeps original post attribution and replayed question IDs. Does not send messages.';
COMMIT;
