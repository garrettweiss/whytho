-- EMERGENCY ROLLBACK ONLY. Restores audited legacy policies and vote trigger.
-- WARNING: this reopens the legacy draft-read and archive-vote vulnerabilities.
-- Prefer fixing forward or rolling back the application while retaining hardening.
-- No records/policies/functions/bucket are deleted. The new bucket stays PRIVATE.
-- Never run automatically. Apply as a transaction after explicit release-owner review.
ALTER POLICY answers_public_read ON public.answers USING (true);
ALTER POLICY answer_media_public_read ON public.answer_media USING (true);
ALTER POLICY answer_media_team_insert ON public.answer_media WITH CHECK (
  EXISTS (SELECT 1 FROM public.politician_team WHERE politician_team.politician_id=answer_media.politician_id AND politician_team.user_id=auth.uid())
);
ALTER POLICY answer_media_team_delete ON public.answer_media USING (
  EXISTS (SELECT 1 FROM public.politician_team WHERE politician_team.politician_id=answer_media.politician_id AND politician_team.user_id=auth.uid())
);
ALTER POLICY answer_media_auth_insert ON storage.objects WITH CHECK (
  bucket_id='answer-media' AND auth.role()='authenticated' AND ((auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE)
);
ALTER POLICY answer_media_auth_delete ON storage.objects USING (bucket_id='answer-media' AND auth.uid()=owner);
ALTER POLICY answer_media_public_read ON storage.objects USING (bucket_id='answer-media');
ALTER POLICY votes_own_insert ON public.votes WITH CHECK (user_id=auth.uid());
ALTER POLICY votes_own_update ON public.votes USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
ALTER POLICY votes_own_delete ON public.votes USING (user_id=auth.uid());
GRANT INSERT, UPDATE ON public.questions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.politician_verifications TO anon, authenticated;
-- Keep the new service-only media RPC for compatible deployed code. No object is dropped.
CREATE OR REPLACE FUNCTION public.update_question_net_upvotes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE questions SET net_upvotes = net_upvotes + NEW.value WHERE id = NEW.question_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE questions SET net_upvotes = net_upvotes - OLD.value WHERE id = OLD.question_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE questions SET net_upvotes = net_upvotes - OLD.value + NEW.value WHERE id = NEW.question_id;
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.update_question_net_upvotes() RESET ALL;
GRANT EXECUTE ON FUNCTION public.update_question_net_upvotes() TO PUBLIC, anon, authenticated, service_role;
-- Keep the new identity-publication trigger and private media RPC as a safety boundary.
NOTIFY pgrst, 'reload schema';
