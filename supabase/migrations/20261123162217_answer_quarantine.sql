-- Withdraw an answer from ordinary readers while retaining the original for review.
ALTER TABLE public.answers ADD COLUMN access_disabled_at timestamptz;

CREATE POLICY answer_quarantine ON public.answers
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (access_disabled_at IS NULL);

REVOKE UPDATE ON public.answers FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_official_answer_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $function$
BEGIN
  -- A moderator can restrict visibility after an office's verification is revoked.
  -- Restoring access and all substantive edits still require normal verification.
  IF TG_OP = 'UPDATE'
    AND OLD.access_disabled_at IS NULL AND NEW.access_disabled_at IS NOT NULL
    AND (to_jsonb(NEW) - ARRAY['access_disabled_at', 'updated_at'])
      = (to_jsonb(OLD) - ARRAY['access_disabled_at', 'updated_at']) THEN
    RETURN NEW;
  END IF;

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
