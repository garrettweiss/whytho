-- Week-one review: set window_end to the exact launch time plus seven days.
WITH settings AS (
  SELECT now() AS window_end
), windows AS (
  SELECT 'last_seven_days' AS window_name,
    window_end - interval '7 days' AS start_at, window_end AS end_at
  FROM settings
  UNION ALL
  SELECT 'prior_seven_days',
    window_end - interval '14 days', window_end - interval '7 days'
  FROM settings
), eligible_questions AS (
  SELECT q.id, q.created_at, q.submitted_by, public_profile.id AS official_id,
    public_profile.slug IN (
      'robert-b-aderholt-alabama', 'eric-burlison-missouri',
      'elizabeth-warren-massachusetts', 'tim-scott-south-carolina'
    ) AS pilot_cohort
  FROM public.questions q
  JOIN public.politicians p ON p.id = q.politician_id
  JOIN public.politicians public_profile
    ON public_profile.id = COALESCE(p.canonical_politician_id, p.id)
  JOIN auth.users submitter ON submitter.id = q.submitted_by
  WHERE q.created_at >= (SELECT min(start_at) FROM windows)
    AND q.created_at < (SELECT max(end_at) FROM windows)
    AND q.status = 'active' AND q.source = 'user' AND NOT q.is_seeded
    AND NOT p.is_test AND NOT public_profile.is_test AND public_profile.is_active
    AND submitter.is_anonymous IS NOT TRUE
), outcomes AS (
  SELECT w.window_name, w.start_at, w.end_at, q.*,
    EXISTS (
      SELECT 1 FROM public.answers a
      WHERE a.question_id = q.id
        AND NOT a.is_ai_generated AND NOT a.is_draft
        AND a.answer_type IN ('direct', 'team_statement')
        AND a.access_disabled_at IS NULL
        AND COALESCE(a.published_at, a.created_at) < w.end_at
    ) AS officially_answered
  FROM windows w
  LEFT JOIN eligible_questions q ON q.created_at >= w.start_at AND q.created_at < w.end_at
)
SELECT window_name, start_at, end_at,
  count(id) AS accepted_public_questions,
  count(DISTINCT submitted_by) AS submitting_accounts,
  count(DISTINCT official_id) AS officials_asked,
  count(id) FILTER (WHERE pilot_cohort) AS questions_for_featured_officials,
  count(id) FILTER (WHERE officially_answered) AS questions_with_official_answers
FROM outcomes
GROUP BY window_name, start_at, end_at
ORDER BY start_at;
