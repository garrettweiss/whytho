-- Retain portrait permissions and history; never delete or overwrite old image objects.
BEGIN;
ALTER TABLE public.politicians ADD COLUMN IF NOT EXISTS photo_credit text;
ALTER TABLE public.politicians ADD COLUMN IF NOT EXISTS photo_rights_basis text;
CREATE TABLE IF NOT EXISTS public.politician_photo_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id uuid NOT NULL REFERENCES public.politicians(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  old_photo_url text,
  new_photo_url text NOT NULL,
  credit text NOT NULL,
  rights_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.politician_photo_history ENABLE ROW LEVEL SECURITY;
-- Supabase defaults grant service_role ALL; retain append/read access only.
REVOKE ALL ON public.politician_photo_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.politician_photo_history TO service_role;

CREATE OR REPLACE FUNCTION public.update_verified_profile(p_actor uuid, p_politician uuid, p_fields jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.politicians; m public.politician_team; merged jsonb; k text; v jsonb;
BEGIN
  SELECT * INTO p FROM public.politicians WHERE id = p_politician FOR UPDATE;
  SELECT * INTO m FROM public.politician_team WHERE politician_id = p_politician AND user_id = p_actor FOR UPDATE;
  IF p.id IS NULL OR m.role IS DISTINCT FROM 'admin' OR p.verification_tier::text NOT IN ('2','3') THEN
    RAISE EXCEPTION 'Verified team admin required' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_fields) f WHERE f NOT IN ('website_url','bio','social_handles')) THEN
    RAISE EXCEPTION 'Invalid profile fields';
  END IF;
  merged := coalesce(p.social_handles, '{}'::jsonb);
  IF p_fields ? 'social_handles' THEN
    FOR k,v IN SELECT key,value FROM jsonb_each(p_fields->'social_handles') LOOP
      IF k NOT IN ('x','twitter','instagram','facebook','tiktok') OR jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION 'Invalid social handle'; END IF;
      IF v = '""'::jsonb THEN merged := merged - k; ELSE merged := jsonb_set(merged, ARRAY[k], v); END IF;
    END LOOP;
  END IF;
  UPDATE public.politicians SET
    website_url = CASE WHEN p_fields ? 'website_url' THEN nullif(p_fields->>'website_url','') ELSE website_url END,
    bio = CASE WHEN p_fields ? 'bio' THEN nullif(p_fields->>'bio','') ELSE bio END,
    social_handles = merged
  WHERE id = p_politician;
  RETURN p.slug;
END;
$$;
REVOKE ALL ON FUNCTION public.update_verified_profile(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_verified_profile(uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_verified_portrait(p_actor uuid, p_politician uuid, p_url text, p_credit text, p_rights_version text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.politicians; m public.politician_team;
BEGIN
  SELECT * INTO p FROM public.politicians WHERE id = p_politician FOR UPDATE;
  SELECT * INTO m FROM public.politician_team WHERE politician_id = p_politician AND user_id = p_actor FOR UPDATE;
  IF p.id IS NULL OR m.role IS DISTINCT FROM 'admin' OR p.verification_tier::text NOT IN ('2','3') THEN
    RAISE EXCEPTION 'Verified team admin required' USING ERRCODE='42501';
  END IF;
  IF p_rights_version <> 'whytho-portrait-permission-v1' OR length(trim(p_credit)) NOT BETWEEN 2 AND 160
    OR p_url !~ ('^https://[a-z0-9.-]+/storage/v1/object/public/politician-photos/' || p_politician::text || '/[a-f0-9-]+\.jpg$') THEN
    RAISE EXCEPTION 'Invalid portrait permission';
  END IF;
  -- Timestamped actor and the prior URL survive each replacement.
  INSERT INTO public.politician_photo_history(politician_id,actor_id,old_photo_url,new_photo_url,credit,rights_version)
    VALUES (p_politician,p_actor,p.photo_url,p_url,trim(p_credit),p_rights_version);
  UPDATE public.politicians SET photo_url=p_url, photo_source_url=p_url,
    photo_credit=trim(p_credit), photo_rights_basis=p_rights_version WHERE id=p_politician;
  RETURN p.slug;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_verified_portrait(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_verified_portrait(uuid,uuid,text,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
