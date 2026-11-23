BEGIN;

ALTER TABLE public.politicians
  ADD COLUMN mayor_city_population integer CHECK (mayor_city_population > 0);

-- Publish the officeholder record after editorial review. Account verification
-- remains governed by the existing claim and verification methods.
CREATE FUNCTION public.publish_reviewed_mayor(
  p_full_name text,
  p_city text,
  p_state text,
  p_official_url text,
  p_existing_id uuid DEFAULT NULL,
  p_reviewed_by uuid DEFAULT NULL,
  p_government_email_domain text DEFAULT NULL,
  p_evidence_url text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  person public.politicians;
  mayor_id uuid;
  mayor_name text := trim(regexp_replace(p_full_name, '[[:space:]]+', ' ', 'g'));
  city_name text := trim(regexp_replace(p_city, '[[:space:]]+', ' ', 'g'));
  state_code text := public.identity_state_code(p_state);
  name_key text := public.identity_name_key(mayor_name);
  city_key text := public.identity_name_key(city_name);
  evidence text := coalesce(p_evidence_url, p_official_url);
  domain text := lower(trim(p_government_email_domain));
  slug_base text;
  url_pattern constant text := '^https://([a-zA-Z0-9-]+[.])+[a-zA-Z]{2,}([/?#][^[:space:]]*)?$';
BEGIN
  IF mayor_name IS NULL OR length(mayor_name) NOT BETWEEN 2 AND 160 OR name_key = ''
    OR city_name IS NULL OR length(city_name) NOT BETWEEN 2 AND 120 OR city_key = ''
    OR state_code IS NULL OR p_official_url IS NULL
    OR length(p_official_url) > 2000 OR p_official_url !~ url_pattern
    OR length(evidence) > 2000 OR evidence !~ url_pattern
    OR (domain IS NOT NULL AND (length(domain) > 253 OR domain !~ '^([a-z0-9-]+[.])+gov$'))
  THEN
    RAISE EXCEPTION 'Invalid reviewed mayor details' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('whytho:politician-identities', 0));

  IF p_existing_id IS NOT NULL THEN
    SELECT p.* INTO person FROM public.politicians p WHERE p.id = p_existing_id FOR UPDATE;
    IF NOT FOUND OR person.is_test OR person.canonical_politician_id IS NOT NULL OR
      public.identity_state_code(person.state) IS DISTINCT FROM state_code THEN
      RAISE EXCEPTION 'Existing profile requires identity review' USING ERRCODE = '55000';
    END IF;
  ELSE
    SELECT p.* INTO person FROM public.politicians p
    WHERE NOT p.is_test AND p.canonical_politician_id IS NULL AND p.is_active AND p.office = 'Mayor'
      AND public.identity_state_code(p.state) = state_code AND public.identity_name_key(p.district) = city_key
      AND public.identity_name_key(p.full_name) = name_key
    LIMIT 1 FOR UPDATE;

    IF person.id IS NULL AND EXISTS (
      SELECT 1 FROM public.politicians p WHERE NOT p.is_test AND (
        public.identity_name_key(p.full_name) = name_key
        OR EXISTS (SELECT 1 FROM unnest(p.aliases) AS alias WHERE public.identity_name_key(alias) = name_key)
        OR EXISTS (SELECT 1 FROM public.politician_aliases a
          WHERE a.politician_id = p.id AND public.identity_name_key(a.alias) = name_key)
      )
    ) THEN
      RAISE EXCEPTION 'Possible existing profile requires identity review' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.politicians p
    WHERE NOT p.is_test AND p.canonical_politician_id IS NULL AND p.is_active AND p.office = 'Mayor'
      AND public.identity_state_code(p.state) = state_code AND public.identity_name_key(p.district) = city_key
      AND p.id IS DISTINCT FROM person.id
  ) THEN
    RAISE EXCEPTION 'This city already has an active mayor profile' USING ERRCODE = '23505';
  END IF;

  IF person.id IS NULL THEN
    mayor_id := gen_random_uuid();
    slug_base := left(trim(both '-' FROM regexp_replace(lower(normalize(mayor_name, NFKD)), '[^a-z0-9]+', '-', 'g')), 100);
    IF slug_base = '' OR EXISTS (SELECT 1 FROM public.politicians p WHERE p.slug = slug_base) THEN
      slug_base := concat_ws('-', nullif(slug_base, ''), 'mayor', lower(state_code), left(mayor_id::text, 8));
    END IF;
    INSERT INTO public.politicians (id, slug, full_name, state, office, district, website_url, politician_type)
    VALUES (mayor_id, slug_base, mayor_name, state_code, 'Mayor', city_name, p_official_url, 'elected');
  ELSE
    mayor_id := person.id;
    IF person.office IS DISTINCT FROM 'Mayor' OR NOT person.is_active
      OR public.identity_name_key(person.district) <> city_key THEN
      IF person.verification_tier <> '0' OR EXISTS (
        SELECT 1 FROM public.politician_team t WHERE t.politician_id = mayor_id
      ) OR EXISTS (
        SELECT 1 FROM public.politician_verification_sources s WHERE s.politician_id = mayor_id
      ) THEN
        RAISE EXCEPTION 'Existing verification requires an office transition review' USING ERRCODE = '55000';
      END IF;
      UPDATE public.politicians SET office = 'Mayor', state = state_code, district = city_name,
        is_active = true, is_candidate = false, politician_type = 'elected', website_url = p_official_url
      WHERE id = mayor_id;
    END IF;
  END IF;

  INSERT INTO public.politician_verification_sources (
    politician_id, official_website_url, evidence_url, government_email_domains, reviewed_by
  ) VALUES (
    mayor_id, p_official_url, evidence, CASE WHEN domain IS NULL THEN '{}'::text[] ELSE ARRAY[domain] END, p_reviewed_by
  ) ON CONFLICT (politician_id) DO NOTHING;

  RETURN mayor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_reviewed_mayor(text, text, text, text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_reviewed_mayor(text, text, text, text, uuid, uuid, text, text) TO service_role;

COMMIT;
