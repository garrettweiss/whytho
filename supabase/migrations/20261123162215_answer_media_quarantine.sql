-- Keep evidence in private storage while disabling delivery and public metadata.
ALTER TABLE public.answer_media ADD COLUMN access_disabled_at timestamptz;

CREATE POLICY answer_media_quarantine ON public.answer_media
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (access_disabled_at IS NULL);

-- Only the operating service role may change the quarantine state.
REVOKE UPDATE ON public.answer_media FROM PUBLIC, anon, authenticated;
