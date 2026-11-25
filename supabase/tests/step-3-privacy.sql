-- Run after participation-assent.sql on a synthetic local database.
BEGIN;

UPDATE public.politicians SET verification_tier = '2' WHERE id = '44444444-1234-4123-8123-444444444444';

INSERT INTO public.answers (id, politician_id, question_id, week_number, body, answer_type, is_draft)
VALUES ('76666666-1234-4123-8123-666666666666', '44444444-1234-4123-8123-444444444444',
  '55555555-1234-4123-8123-555555555555', public.current_week_number(), 'Synthetic response for an attachment test.', 'direct', false);
INSERT INTO public.answer_media (id, politician_id, answer_id, media_type, storage_path, public_url)
VALUES ('77777777-1234-4123-8123-777777777777', '44444444-1234-4123-8123-444444444444',
  '76666666-1234-4123-8123-666666666666', 'image', 'synthetic/image.png',
  '/api/answer-media/77777777-1234-4123-8123-777777777777');

SET LOCAL ROLE anon;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM public.answer_media WHERE id = '77777777-1234-4123-8123-777777777777') THEN
    RAISE EXCEPTION 'Attachment must be publicly visible before quarantine';
  END IF;
END $$;
RESET ROLE;

UPDATE public.answer_media SET access_disabled_at = now() WHERE id = '77777777-1234-4123-8123-777777777777';

SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.answer_media WHERE id = '77777777-1234-4123-8123-777777777777') THEN
    RAISE EXCEPTION 'Quarantined attachment was visible to a guest';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1234-4123-8123-111111111111', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.answer_media WHERE id = '77777777-1234-4123-8123-777777777777') THEN
    RAISE EXCEPTION 'Quarantined attachment was visible to a team member';
  END IF;
  BEGIN
    UPDATE public.answer_media SET access_disabled_at = NULL WHERE id = '77777777-1234-4123-8123-777777777777';
    RAISE EXCEPTION 'An ordinary account could update quarantine state';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM public.answer_media WHERE id = '77777777-1234-4123-8123-777777777777' AND access_disabled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Private attachment evidence was unavailable';
  END IF;
  IF NOT EXISTS (SELECT FROM public.answers WHERE id = '76666666-1234-4123-8123-666666666666') THEN
    RAISE EXCEPTION 'Answer was unavailable after attachment quarantine';
  END IF;
END $$;
RESET ROLE;

UPDATE public.politicians SET verification_tier = '1' WHERE id = '44444444-1234-4123-8123-444444444444';
UPDATE public.answers SET access_disabled_at = now() WHERE id = '76666666-1234-4123-8123-666666666666';
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.answers WHERE id = '76666666-1234-4123-8123-666666666666') THEN
    RAISE EXCEPTION 'Quarantined answer was publicly visible';
  END IF;
END $$;
RESET ROLE;

INSERT INTO public.user_profiles (id) VALUES ('11111111-1234-4123-8123-111111111111') ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  BEGIN
    UPDATE public.user_profiles SET political_affiliation = 'Other' WHERE id = '11111111-1234-4123-8123-111111111111';
    RAISE EXCEPTION 'New political affiliation accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;
UPDATE public.user_profiles SET city = 'Synthetic City' WHERE id = '11111111-1234-4123-8123-111111111111';
SELECT 'PASS: public attachment hidden from guests and its authorized team, private evidence and answer retained, new political affiliation rejected';

ROLLBACK;
