-- Only the cached server directory needs access to this aggregation.
CREATE FUNCTION public.homepage_directory_ranking(p_as_of timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  WITH profiles AS (
    SELECT id, full_name, state, office, politician_type, is_candidate, bioguide_id
    FROM public.politicians
    WHERE canonical_politician_id IS NULL AND is_active AND NOT is_test
      AND photo_url ~* '^https://[^/?#[:space:]]+[^[:space:]]*$'
  ), eligible_questions AS (
    SELECT p.id AS profile_id, q.id, q.created_at, q.source, q.is_seeded
    FROM public.politicians member
    JOIN profiles p ON p.id = coalesce(member.canonical_politician_id, member.id)
    JOIN public.questions q ON q.politician_id = member.id
    WHERE q.status = 'active' AND q.created_at <= p_as_of
  ), events AS (
    SELECT profile_id, created_at
    FROM eligible_questions
    WHERE source = 'user' AND NOT is_seeded
    UNION ALL
    SELECT q.profile_id, v.created_at
    FROM eligible_questions q
    JOIN public.votes v ON v.question_id = q.id
    WHERE v.created_at <= p_as_of
  ), activity_by_week AS (
    SELECT profile_id,
      floor(extract(epoch FROM p_as_of - created_at) / 604800) AS age_weeks,
      count(*) AS engagement
    FROM events
    GROUP BY profile_id, age_weeks
  ), latest_activity AS (
    SELECT DISTINCT ON (profile_id) profile_id, age_weeks, engagement
    FROM activity_by_week
    ORDER BY profile_id, age_weeks
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(p.id, p.full_name, p.state, p.office) ORDER BY
    a.age_weeks ASC NULLS LAST,
    a.engagement DESC NULLS LAST,
    -- Older FEC-only rows can be marked elected, even if they are challengers.
    CASE WHEN a.profile_id IS NULL AND p.politician_type = 'elected'
      AND (NOT p.is_candidate OR p.bioguide_id IS NOT NULL)
      AND p.office IN ('U.S. Senator', 'U.S. Representative') THEN 0 ELSE 1 END,
    md5((p_as_of AT TIME ZONE 'UTC')::date::text || p.id::text),
    p.id
  ), '[]'::jsonb)
  FROM profiles p
  LEFT JOIN latest_activity a ON a.profile_id = p.id;
$$;

REVOKE ALL ON FUNCTION public.homepage_directory_ranking(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.homepage_directory_ranking(timestamptz) TO service_role;
