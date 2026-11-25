-- Legitimate self-service lifecycle on synthetic users/profiles only.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false);
CREATE TABLE public.politicians(id uuid PRIMARY KEY,verification_tier text,is_active boolean,is_test boolean DEFAULT false);
CREATE TABLE public.politician_team(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,user_id uuid REFERENCES auth.users);
CREATE FUNCTION public.assert_true(v boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
\ir ../migrations/20261122000100_politician_notification_preferences.sql
INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001','first@example.test',now(),false),('00000000-0000-4000-8000-000000000002','second@example.test',now(),false);
INSERT INTO public.politicians VALUES('10000000-0000-4000-8000-000000000001','2',true,false),('10000000-0000-4000-8000-000000000002','2',true,false);
INSERT INTO public.politician_team(politician_id,user_id) VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
SET ROLE service_role;
SELECT public.assert_true(public.get_politician_notification_preferences('00000000-0000-4000-8000-000000000001')='[]'::jsonb,'new accounts have no opt-in');
SELECT public.assert_true(public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','daily','America/New_York','politician-question-notices-v1')->>'mode'='daily','verified member can opt into own daily summary');
SELECT public.assert_true(public.get_politician_notification_preferences('00000000-0000-4000-8000-000000000002')='[]'::jsonb,'another member stays unsubscribed');
SELECT public.assert_true((SELECT consented_at IS NOT NULL AND consent_text IS NOT NULL AND length(contact_hash)=64 AND timezone='America/New_York' AND revoked_at IS NULL FROM public.politician_notification_preferences),'consent evidence and verified contact binding retained');
SELECT public.assert_true(public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','off','UTC')->>'mode'='off','member can stop emails immediately');
SELECT public.assert_true((SELECT revoked_at IS NOT NULL AND consented_at IS NOT NULL FROM public.politician_notification_preferences),'opt-out preserves consent evidence and records revocation');
SELECT public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','daily','America/Chicago','politician-question-notices-v1');
RESET ROLE;
-- Membership transfer uses UPDATE so this suite does not delete any fixture rows.
UPDATE public.politician_team SET politician_id='10000000-0000-4000-8000-000000000002' WHERE user_id='00000000-0000-4000-8000-000000000001';
SELECT public.assert_true((SELECT mode='off' AND revoked_at IS NOT NULL FROM public.politician_notification_preferences),'membership departure revokes old-office preference');
SET ROLE service_role;
SELECT public.assert_true(public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','off','UTC')->>'mode'='off','former member can repeat opt-out');
RESET ROLE;
UPDATE public.politician_team SET politician_id='10000000-0000-4000-8000-000000000001' WHERE user_id='00000000-0000-4000-8000-000000000001';
SELECT public.assert_true((SELECT mode='off' FROM public.politician_notification_preferences),'rejoining does not revive old consent');
SELECT public.assert_true(NOT has_table_privilege('authenticated','public.politician_notification_preferences','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'preferences cannot be changed by direct browser table access');
SELECT public.assert_true(NOT has_function_privilege('authenticated','public.set_politician_notification_preference(uuid,uuid,text,text,text)','EXECUTE'),'actor-binding RPC is service-only');
SELECT public.assert_true(NOT has_table_privilege('service_role','public.politician_notification_consent_audit','INSERT,UPDATE,DELETE,TRUNCATE'),'service access cannot forge/rewrite consent evidence');
SELECT public.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.politician_notification_preferences'::regclass,'public.politician_notification_consent_audit'::regclass)),'both preference tables use RLS');
\ir ../migrations/20261122000100_politician_notification_preferences.sql
SELECT public.assert_true((SELECT count(*)=1 FROM public.politician_notification_preferences),'repeat migration preserves existing preference');
