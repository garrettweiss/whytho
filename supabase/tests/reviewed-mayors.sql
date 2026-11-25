\ir politician-identities-live-base.sql

ALTER TABLE public.politician_verification_sources
  ADD COLUMN official_website_url text NOT NULL,
  ADD COLUMN evidence_url text NOT NULL,
  ADD COLUMN government_email_domains text[] NOT NULL;

-- A prior congressional profile must keep its URL and associated record.
INSERT INTO public.politicians (slug, full_name, state, office, bioguide_id)
VALUES ('barbara-lee-ca', 'Barbara Lee', 'CA', 'U.S. Representative', 'L000551');

\ir ../migrations/20261123210000_reviewed_mayors.sql
\ir ../migrations/20261123210010_seed_top_50_mayors.sql

SELECT public.assert_true(
  NOT has_function_privilege('anon', 'public.publish_reviewed_mayor(text,text,text,text,uuid,uuid,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.publish_reviewed_mayor(text,text,text,text,uuid,uuid,text,text)', 'EXECUTE'),
  'only the server can publish a reviewed mayor'
);

SET ROLE anon;
SELECT public.assert_true(
  count(*) = 50 AND count(DISTINCT (district, state)) = 50 AND bool_and(verification_tier = '0'),
  'the public roster has exactly 50 unique cities with unclaimed profiles'
) FROM public.politicians WHERE office = 'Mayor' AND is_active AND NOT is_test;
SELECT public.assert_true(
  (array_agg(district ORDER BY mayor_city_population DESC))[1] = 'New York City'
  AND (array_agg(district ORDER BY mayor_city_population DESC))[50] = 'Aurora'
  AND count(*) FILTER (WHERE slug = 'zohran-mamdani' AND district = 'New York City') = 1
  AND count(*) FILTER (WHERE slug = 'barbara-lee-ca' AND district = 'Oakland') = 1,
  'roster has the expected population endpoints and preserves prior handles'
) FROM public.politicians WHERE office = 'Mayor';
RESET ROLE;

SET ROLE service_role;
SELECT public.assert_true(
  (SELECT count(*) = 50 FROM public.politician_verification_sources s
    JOIN public.politicians p ON p.id = s.politician_id WHERE p.office = 'Mayor'),
  'each roster entry retains an official source'
);
DO $$
DECLARE mayor_id uuid;
BEGIN
  mayor_id := public.publish_reviewed_mayor('Zohran Mamdani', 'New York City', 'NY', 'https://www.nyc.gov/mayors-office');
  PERFORM public.assert_true(
    (SELECT slug = 'zohran-mamdani' FROM public.politicians WHERE id = mayor_id),
    'publishing a previously reviewed person is idempotent'
  );
  BEGIN
    PERFORM public.publish_reviewed_mayor('Another Mayor', 'New York City', 'NY', 'https://www.nyc.gov/mayors-office');
    RAISE EXCEPTION 'Conflicting mayor was published';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  mayor_id := public.publish_reviewed_mayor('Small Town Mayor', 'Small Town', 'VT', 'https://example.gov/mayor');
  PERFORM public.assert_true(
    (SELECT mayor_city_population IS NULL AND verification_tier = '0' FROM public.politicians WHERE id = mayor_id),
    'reviewed community additions are public outside the initial ranking'
  );
END;
$$;
RESET ROLE;
