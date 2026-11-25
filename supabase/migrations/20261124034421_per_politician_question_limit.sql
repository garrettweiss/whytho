BEGIN;

-- Daily quota lookups filter by submitter, canonical politician, and recency.
CREATE INDEX IF NOT EXISTS questions_user_politician_daily_quota_idx
  ON public.questions (submitted_by, politician_id, created_at)
  WHERE NOT is_seeded AND submitted_by IS NOT NULL;

-- Each person may ask each politician at most 5 questions in any rolling
-- 24-hour window. Replaces the earlier 5-total / 3-per-politician daily rule.
CREATE OR REPLACE FUNCTION public.enforce_question_submission_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.is_seeded OR NEW.submitted_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- The earlier identity trigger binds NEW to the canonical politician and
  -- holds the identity lock. Keep concurrent submissions by this user serialized.
  PERFORM pg_advisory_xact_lock(hashtextextended('question-quota:' || NEW.submitted_by::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.questions q
    JOIN public.politicians p ON p.id = q.politician_id
    WHERE q.submitted_by = NEW.submitted_by
      AND NOT q.is_seeded
      AND q.created_at > now() - interval '24 hours'
      AND coalesce(p.canonical_politician_id, p.id) = NEW.politician_id
    OFFSET 4
  ) THEN
    RAISE EXCEPTION 'Question submission limit reached' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_question_submission_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_question_submission_limit() TO service_role;

COMMIT;
