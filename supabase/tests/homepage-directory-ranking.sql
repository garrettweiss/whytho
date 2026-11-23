\ir politician-identities-live-base.sql

-- Complete the synthetic votes table with the production columns used here.
ALTER TABLE public.votes
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN value smallint NOT NULL DEFAULT 1;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

\ir ../migrations/20261123195800_homepage_directory_ranking.sql

INSERT INTO public.politicians (slug, full_name, office, is_candidate, bioguide_id, photo_url)
SELECT slug, slug, office, is_candidate, bioguide_id, photo_url FROM (VALUES
  ('ranking-mixed-votes', 'Governor', false, NULL, 'https://example.test/mixed.jpg'),
  ('ranking-fresh-question', 'Governor', false, NULL, 'https://example.test/fresh.jpg'),
  ('ranking-older-activity', 'Governor', false, NULL, 'https://example.test/older.jpg'),
  ('ranking-oldest-activity', 'Governor', false, NULL, 'https://example.test/oldest.jpg'),
  ('ranking-sitting-senator', 'U.S. Senator', false, 'R900001', 'https://example.test/senator.jpg'),
  ('ranking-sitting-representative', 'U.S. Representative', true, 'R900002', 'https://example.test/house.jpg'),
  ('ranking-legacy-challenger', 'U.S. Senator', true, NULL, 'https://example.test/challenger.jpg'),
  ('ranking-no-picture', 'U.S. Senator', false, 'R900003', NULL),
  ('ranking-moderated-question', 'Governor', false, NULL, 'https://example.test/moderated.jpg')
) AS fixture(slug, office, is_candidate, bioguide_id, photo_url);

INSERT INTO public.questions (politician_id, created_at, source, is_seeded, status)
SELECT p.id, '2026-11-23 20:00Z'::timestamptz - age * interval '24 hours', source, seeded, status
FROM (VALUES
  ('ranking-mixed-votes', 21, 'ai', true, 'active'),
  ('ranking-fresh-question', 2, 'user', false, 'active'),
  ('ranking-older-activity', 9, 'user', false, 'active'),
  ('ranking-oldest-activity', 15, 'user', false, 'active'),
  ('ranking-no-picture', 1, 'user', false, 'active'),
  ('ranking-legacy-challenger', 1, 'x', false, 'active'),
  ('ranking-moderated-question', 1, 'user', false, 'removed')
) AS fixture(slug, age, source, seeded, status)
JOIN public.politicians p USING (slug);

INSERT INTO public.votes (question_id, created_at, value)
SELECT q.id, '2026-11-22 00:00Z', v.value
FROM public.questions q JOIN public.politicians p ON p.id = q.politician_id
CROSS JOIN (VALUES (1), (-1)) AS v(value)
WHERE p.slug = 'ranking-mixed-votes';

SELECT public.assert_true(
  NOT has_function_privilege('anon', 'public.homepage_directory_ranking(timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.homepage_directory_ranking(timestamptz)', 'EXECUTE'),
  'ranking RPC is restricted to the server role');

SET ROLE service_role;
WITH names AS (
  SELECT array_agg(profile->>1 ORDER BY n) AS ordered
  FROM jsonb_array_elements(public.homepage_directory_ranking('2026-11-23 20:00Z'))
    WITH ORDINALITY AS profiles(profile, n)
  WHERE profile->>1 LIKE 'ranking-%'
)
SELECT public.assert_true(
  ordered[1:4] = ARRAY['ranking-mixed-votes','ranking-fresh-question','ranking-older-activity','ranking-oldest-activity']
  AND ordered[5:6] @> ARRAY['ranking-sitting-senator','ranking-sitting-representative']
  AND ordered[7:8] @> ARRAY['ranking-legacy-challenger','ranking-moderated-question']
  AND cardinality(ordered) = 8,
  'rolling activity, photos, congressional roster and legacy challenger fallback')
FROM names;
RESET ROLE;
