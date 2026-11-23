BEGIN;
CREATE TABLE IF NOT EXISTS public.politician_notification_preferences (
 politician_id uuid NOT NULL REFERENCES public.politicians(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 mode text NOT NULL DEFAULT 'off' CHECK(mode IN ('off','daily')),
 timezone text NOT NULL DEFAULT 'UTC',
 consent_version text,
 consent_text text,
 consented_at timestamptz,
 contact_hash text,
 revoked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(politician_id,user_id),
 CHECK(mode='off' OR (consent_version='politician-question-notices-v1' AND consent_text IS NOT NULL AND consented_at IS NOT NULL AND contact_hash IS NOT NULL AND revoked_at IS NULL))
);
CREATE TABLE IF NOT EXISTS public.politician_notification_consent_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 politician_id uuid NOT NULL,
 user_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN ('off','daily')),
 source text NOT NULL CHECK(source IN ('self_settings','membership_revoked')),
 consent_version text,
 consent_text text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.politician_notification_preferences OWNER TO postgres;
ALTER TABLE public.politician_notification_consent_audit OWNER TO postgres;
ALTER TABLE public.politician_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.politician_notification_consent_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.politician_notification_preferences,public.politician_notification_consent_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.politician_notification_preferences,public.politician_notification_consent_audit TO service_role;

CREATE OR REPLACE FUNCTION public.set_politician_notification_preference(p_actor_id uuid,p_politician_id uuid,p_mode text,p_timezone text,p_consent_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account record; person record; saved public.politician_notification_preferences;
 consent constant text := 'Email me a daily summary of new questions for this office at 9 a.m. in my selected timezone, at most once per 24 hours. I can turn these emails off at any time.';
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN ('off','daily') THEN RAISE EXCEPTION 'Choose off or daily' USING ERRCODE='22023'; END IF;
 SELECT id,email,email_confirmed_at,is_anonymous INTO account FROM auth.users WHERE id=p_actor_id;
 IF NOT FOUND OR account.is_anonymous IS TRUE THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT id,verification_tier,is_active,is_test INTO person FROM public.politicians WHERE id=p_politician_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
 IF p_mode='daily' THEN
  IF account.email_confirmed_at IS NULL OR account.email IS NULL
    OR person.verification_tier NOT IN ('2','3') OR NOT person.is_active OR person.is_test
    OR NOT EXISTS(SELECT 1 FROM public.politician_team WHERE politician_id=p_politician_id AND user_id=p_actor_id)
   THEN RAISE EXCEPTION 'A verified email and current verified office membership are required' USING ERRCODE='42501'; END IF;
  IF p_consent_version IS DISTINCT FROM 'politician-question-notices-v1' THEN RAISE EXCEPTION 'Confirm the current email preference text' USING ERRCODE='22023'; END IF;
  IF p_timezone IS NULL OR length(p_timezone)>100 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone)
   THEN RAISE EXCEPTION 'Choose a valid timezone' USING ERRCODE='22023'; END IF;
 ELSE
  -- Opt-out works even after membership removal or email/profile verification loss.
  IF NOT EXISTS(SELECT 1 FROM public.politician_notification_preferences WHERE politician_id=p_politician_id AND user_id=p_actor_id)
    AND NOT EXISTS(SELECT 1 FROM public.politician_team WHERE politician_id=p_politician_id AND user_id=p_actor_id)
   THEN RAISE EXCEPTION 'No notification preference for this account' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO public.politician_notification_preferences(politician_id,user_id,mode,timezone,consent_version,consent_text,consented_at,contact_hash,revoked_at,updated_at)
 VALUES(p_politician_id,p_actor_id,p_mode,CASE WHEN p_mode='daily' THEN p_timezone ELSE 'UTC' END,
  CASE WHEN p_mode='daily' THEN p_consent_version END,CASE WHEN p_mode='daily' THEN consent END,
  CASE WHEN p_mode='daily' THEN now() END,
  CASE WHEN p_mode='daily' THEN encode(sha256(convert_to(lower(trim(account.email)),'UTF8')),'hex') END,
  CASE WHEN p_mode='off' THEN now() END,now())
 ON CONFLICT(politician_id,user_id) DO UPDATE SET mode=excluded.mode,
  timezone=CASE WHEN excluded.mode='daily' THEN excluded.timezone ELSE politician_notification_preferences.timezone END,
  consent_version=coalesce(excluded.consent_version,politician_notification_preferences.consent_version),
  consent_text=coalesce(excluded.consent_text,politician_notification_preferences.consent_text),
  consented_at=coalesce(excluded.consented_at,politician_notification_preferences.consented_at),
  contact_hash=coalesce(excluded.contact_hash,politician_notification_preferences.contact_hash),
  revoked_at=excluded.revoked_at,updated_at=excluded.updated_at
 RETURNING * INTO saved;
 INSERT INTO public.politician_notification_consent_audit(politician_id,user_id,mode,source,consent_version,consent_text)
 VALUES(saved.politician_id,saved.user_id,saved.mode,'self_settings',saved.consent_version,saved.consent_text);
 RETURN jsonb_build_object('mode',saved.mode,'timezone',saved.timezone,'consent_version',saved.consent_version,'revoked_at',saved.revoked_at);
END $$;

CREATE OR REPLACE FUNCTION public.get_politician_notification_preferences(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor_id AND is_anonymous IS NOT TRUE)
  THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('politician_id',politician_id,'mode',mode,'timezone',timezone,'consent_version',consent_version,'revoked_at',revoked_at) ORDER BY politician_id)
 FROM public.politician_notification_preferences WHERE user_id=p_actor_id),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_removed_member_notification_preference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.user_id=NEW.user_id AND OLD.politician_id=NEW.politician_id THEN RETURN NEW; END IF;
 END IF;
 UPDATE public.politician_notification_preferences SET mode='off',revoked_at=now(),updated_at=now()
 WHERE user_id=OLD.user_id AND politician_id=OLD.politician_id AND mode<>'off';
 IF FOUND THEN
  INSERT INTO public.politician_notification_consent_audit(politician_id,user_id,mode,source)
  VALUES(OLD.politician_id,OLD.user_id,'off','membership_revoked');
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.set_politician_notification_preference(uuid,uuid,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.get_politician_notification_preferences(uuid) OWNER TO postgres;
ALTER FUNCTION public.revoke_removed_member_notification_preference() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_politician_notification_preference(uuid,uuid,text,text,text),public.get_politician_notification_preferences(uuid),public.revoke_removed_member_notification_preference() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_politician_notification_preference(uuid,uuid,text,text,text),public.get_politician_notification_preferences(uuid) TO service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.politician_team'::regclass AND tgname='notification_preference_membership_revoked' AND NOT tgisinternal) THEN
  CREATE TRIGGER notification_preference_membership_revoked AFTER DELETE OR UPDATE OF user_id,politician_id ON public.politician_team FOR EACH ROW EXECUTE FUNCTION public.revoke_removed_member_notification_preference();
 END IF;
END $$;
COMMIT;
