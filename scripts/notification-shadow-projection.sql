-- Run only through the synthetic local runner for now. No addresses or bodies.
-- A future worker still needs global suppression and durable accepted-send history.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT coalesce(jsonb_agg(row_to_json(candidate) ORDER BY event_id,user_id),'[]'::jsonb) FROM (
 SELECT e.id::text AS event_id,e.question_id::text,e.politician_id::text,n.user_id::text,
  e.question_created_at,n.timezone,
  coalesce(q.status='active' AND q.source='user' AND NOT q.is_seeded AND q.x_post_id IS NULL
   AND p.is_active AND NOT p.is_test AND p.verification_tier::text IN ('2','3')
   AND t.user_id IS NOT NULL AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS NOT TRUE
   AND n.mode='daily' AND n.revoked_at IS NULL
   AND n.consent_version='politician-question-notices-v1' AND n.consented_at<=now()
   AND NOT EXISTS(SELECT 1 FROM public.answers a WHERE a.question_id=q.id AND NOT a.is_draft AND NOT a.is_ai_generated)
   AND n.contact_hash=encode(sha256(convert_to(lower(trim(u.email)),'UTF8')),'hex'),false) AS eligible
 FROM public.question_notification_events e
 JOIN public.questions q ON q.id=e.question_id AND q.politician_id=e.politician_id
 JOIN public.politicians p ON p.id=e.politician_id
 JOIN public.politician_notification_preferences n ON n.politician_id=e.politician_id
 JOIN auth.users u ON u.id=n.user_id
 LEFT JOIN public.politician_team t ON t.politician_id=e.politician_id AND t.user_id=n.user_id
) candidate;
COMMIT;
