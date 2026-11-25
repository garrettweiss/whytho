BEGIN;

-- Store only public correction content here. Actor attribution stays in the private audit ledger.
CREATE TABLE public.answer_corrections (
  id uuid PRIMARY KEY,
  answer_id uuid NOT NULL REFERENCES public.answers(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 10 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX answer_corrections_answer_date_idx
  ON public.answer_corrections(answer_id, created_at, id);
ALTER TABLE public.answer_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.answer_corrections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.answer_corrections TO anon, authenticated, service_role;
CREATE POLICY answer_corrections_public_read ON public.answer_corrections FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.answers AS a JOIN public.questions AS q
      ON q.id=a.question_id AND q.politician_id=a.politician_id
    WHERE a.id=answer_corrections.answer_id AND q.status='active'
      AND a.is_draft=false AND a.is_ai_generated=false
      AND a.answer_type IN ('direct','team_statement')
  ));

-- The original published wording and source list are the permanent record.
-- Draft edits and moderation metadata updates still use their existing paths.
CREATE FUNCTION public.preserve_official_answer_original()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $function$
BEGIN
  IF OLD.is_draft=false AND OLD.is_ai_generated=false
    AND OLD.answer_type IN ('direct','team_statement')
    AND (NEW.body IS DISTINCT FROM OLD.body OR NEW.sources IS DISTINCT FROM OLD.sources) THEN
    RAISE EXCEPTION 'Publish a correction alongside the original response' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.preserve_official_answer_original() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER answers_preserve_original
  BEFORE UPDATE OF body,sources ON public.answers FOR EACH ROW
  EXECUTE FUNCTION public.preserve_official_answer_original();

CREATE FUNCTION public.publish_answer_correction(
  p_actor_id uuid, p_answer_id uuid, p_correction_id uuid, p_body text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE
  original record;
  profile record;
  question record;
  actor_role public.politician_team_role;
  correction record;
  submitted_body text := trim(p_body);
BEGIN
  IF p_correction_id IS NULL OR submitted_body IS NULL OR length(submitted_body) NOT BETWEEN 10 AND 5000 THEN
    RAISE EXCEPTION 'Correction must be 10 to 5000 characters' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_actor_id AND is_anonymous IS NOT TRUE) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT politician_id,question_id INTO original FROM public.answers WHERE id=p_answer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Answer not found' USING ERRCODE='P0002'; END IF;

  -- Match the existing profile, question and answer lock order.
  SELECT id,verification_tier INTO profile FROM public.politicians WHERE id=original.politician_id FOR UPDATE;
  IF NOT FOUND OR profile.verification_tier IS NULL OR profile.verification_tier NOT IN ('2','3') THEN
    RAISE EXCEPTION 'A verified office is required to publish corrections' USING ERRCODE='42501';
  END IF;
  SELECT id,status INTO question FROM public.questions
    WHERE id=original.question_id AND politician_id=profile.id FOR SHARE;
  IF NOT FOUND OR question.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This question is unavailable for public correction' USING ERRCODE='22023';
  END IF;
  SELECT role INTO actor_role FROM public.politician_team
    WHERE politician_id=profile.id AND user_id=p_actor_id FOR SHARE;
  IF NOT FOUND OR actor_role IS NULL OR actor_role NOT IN ('admin','editor') THEN
    RAISE EXCEPTION 'A verified office admin or editor must publish corrections' USING ERRCODE='42501';
  END IF;
  SELECT id,is_draft,is_ai_generated,answer_type,is_disputed INTO original FROM public.answers
    WHERE id=p_answer_id AND politician_id=profile.id AND question_id=question.id FOR UPDATE;
  IF NOT FOUND OR original.is_draft IS DISTINCT FROM false
    OR original.is_ai_generated IS DISTINCT FROM false
    OR original.answer_type IS NULL OR original.answer_type NOT IN ('direct','team_statement') THEN
    RAISE EXCEPTION 'Only published official responses can receive corrections' USING ERRCODE='22023';
  END IF;
  IF original.is_disputed IS TRUE THEN
    RAISE EXCEPTION 'This response is under review. Contact support to submit a correction' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.answer_corrections(id,answer_id,body)
    VALUES(p_correction_id,p_answer_id,submitted_body)
    ON CONFLICT (id) DO NOTHING
    RETURNING id,created_at INTO correction;
  IF FOUND THEN
    INSERT INTO public.politician_account_audit(politician_id,actor_id,action,subject_id,details)
      VALUES(profile.id,p_actor_id,'answer_correction_publish',p_correction_id,
        jsonb_build_object('answer_id',p_answer_id,'question_id',question.id));
  ELSE
    SELECT c.id,c.created_at INTO correction FROM public.answer_corrections AS c
      JOIN public.politician_account_audit AS a
        ON a.subject_id=c.id AND a.action='answer_correction_publish' AND a.actor_id=p_actor_id
      WHERE c.id=p_correction_id AND c.answer_id=p_answer_id AND c.body=submitted_body;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Correction request already used' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN jsonb_build_object('success',true,'correction_id',correction.id,'created_at',correction.created_at);
END;
$function$;
ALTER FUNCTION public.publish_answer_correction(uuid,uuid,uuid,text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.publish_answer_correction(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_answer_correction(uuid,uuid,uuid,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
