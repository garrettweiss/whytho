-- Stop collecting new political-affiliation values. Preserve legacy records for rights review.
CREATE FUNCTION public.prevent_new_political_affiliation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.political_affiliation IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.political_affiliation IS NOT DISTINCT FROM OLD.political_affiliation THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'WhyTho is not collecting political affiliation' USING ERRCODE = '23514';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_new_political_affiliation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER user_profiles_pause_affiliation_collection
  BEFORE INSERT OR UPDATE OF political_affiliation ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_new_political_affiliation();
