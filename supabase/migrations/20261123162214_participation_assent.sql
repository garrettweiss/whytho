BEGIN;
CREATE TABLE public.participation_assents (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 terms_version text NOT NULL CHECK (terms_version='terms-2026-11-23'),
 accepted_at timestamptz NOT NULL DEFAULT now(),
 adult_attested_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,terms_version)
);
ALTER TABLE public.participation_assents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.participation_assents FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.participation_assents TO authenticated,service_role;
CREATE POLICY participation_assents_own_read ON public.participation_assents FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE FUNCTION public.account_has_participation_assent(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM auth.users u JOIN public.participation_assents a ON a.user_id=u.id WHERE u.id=p_user AND u.is_anonymous IS NOT TRUE AND a.terms_version='terms-2026-11-23');
$$;
REVOKE ALL ON FUNCTION public.account_has_participation_assent(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.has_current_participation_assent() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.account_has_participation_assent(auth.uid()); $$;
REVOKE ALL ON FUNCTION public.has_current_participation_assent() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_current_participation_assent() TO authenticated;
CREATE FUNCTION public.accept_participation_terms(p_terms_version text,p_adult boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM auth.users WHERE id=auth.uid() AND is_anonymous IS NOT TRUE) THEN RAISE EXCEPTION 'Account required' USING ERRCODE='42501'; END IF;
 IF p_adult IS DISTINCT FROM true OR p_terms_version IS DISTINCT FROM 'terms-2026-11-23' THEN RAISE EXCEPTION 'Current affirmative adult attestation and Terms required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.participation_assents(user_id,terms_version) VALUES(auth.uid(),p_terms_version) ON CONFLICT DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.accept_participation_terms(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_participation_terms(text,boolean) TO authenticated;
CREATE FUNCTION public.require_participation_assent(p_user uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT public.account_has_participation_assent(p_user) THEN RAISE EXCEPTION 'Current adult attestation and Terms acceptance required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_participation_assent(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.guard_vote_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM public.require_participation_assent(CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_vote_participation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER votes_require_participation BEFORE INSERT OR UPDATE OR DELETE ON public.votes FOR EACH ROW EXECUTE FUNCTION public.guard_vote_participation();
CREATE FUNCTION public.is_registered_participation_account() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT FROM auth.users WHERE id=auth.uid() AND is_anonymous IS NOT TRUE); $$;
REVOKE ALL ON FUNCTION public.is_registered_participation_account() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_registered_participation_account() TO authenticated;
ALTER POLICY votes_own_read ON public.votes USING(user_id=(SELECT auth.uid()) AND public.is_registered_participation_account());
CREATE FUNCTION public.guard_question_participation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.submitted_by IS NOT NULL THEN PERFORM public.require_participation_assent(NEW.submitted_by); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_question_participation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER questions_require_participation BEFORE INSERT ON public.questions FOR EACH ROW EXECUTE FUNCTION public.guard_question_participation();
-- Account functions already enforce actor roles and retain all existing ACLs. Add assent before their existing checks.
DO $migration$
DECLARE f record; definition text; guard text;
BEGIN
 FOR f IN SELECT p.oid,p.proname,pg_get_functiondef(p.oid) AS source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('claim_politician_profile','manage_politician_team','save_politician_answer','publish_answer_correction','update_verified_profile','replace_verified_portrait','set_politician_notification_preference') LOOP
  guard := CASE WHEN f.proname IN ('update_verified_profile','replace_verified_portrait') THEN 'PERFORM public.require_participation_assent(p_actor);'
    WHEN f.proname='manage_politician_team' THEN 'IF p_action <> ''disconnect'' THEN PERFORM public.require_participation_assent(p_actor_id); END IF;'
    WHEN f.proname='set_politician_notification_preference' THEN 'IF p_mode <> ''off'' THEN PERFORM public.require_participation_assent(p_actor_id); END IF;'
    ELSE 'PERFORM public.require_participation_assent(p_actor_id);' END;
  IF f.source !~ '\mBEGIN\M' THEN RAISE EXCEPTION 'Unsupported function body: %',f.proname; END IF;
  definition := regexp_replace(f.source,'\mBEGIN\M','BEGIN '||guard);
  EXECUTE definition;
 END LOOP;
END $migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
