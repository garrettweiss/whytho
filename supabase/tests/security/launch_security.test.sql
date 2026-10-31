-- Local fixtures only. See scripts/test-launch-security.sh.
\ir scaffold.sql
-- Live Supabase defaults include service_role ALL on each newly created table.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER TABLE auth.users ADD COLUMN email text;
ALTER TABLE auth.users ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE public.politicians ADD COLUMN slug text;
ALTER TABLE public.politicians ADD COLUMN full_name text;
ALTER TABLE public.politicians ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.politicians ADD COLUMN bio text;
ALTER TABLE public.politicians ADD COLUMN website_url text;
ALTER TABLE public.politicians ADD COLUMN social_handles jsonb;
ALTER TABLE public.politicians ADD COLUMN photo_url text;
ALTER TABLE public.politicians ADD COLUMN photo_source_url text;
ALTER TABLE public.politician_team ADD COLUMN invited_by uuid;
ALTER TABLE public.politician_team ADD COLUMN created_at timestamptz DEFAULT now();
ALTER TABLE public.questions ADD COLUMN is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.questions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.answers ADD COLUMN week_number integer;
ALTER TABLE public.answers ADD COLUMN sources jsonb;
ALTER TABLE public.answers ADD COLUMN is_disputed boolean;
ALTER TABLE public.answers ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.user_profiles(id uuid PRIMARY KEY REFERENCES auth.users,is_admin boolean NOT NULL DEFAULT false,display_name text);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_profiles TO anon,authenticated,service_role;
GRANT UPDATE(is_admin) ON public.user_profiles TO authenticated;
CREATE POLICY profiles_own_read ON public.user_profiles FOR SELECT USING(id=auth.uid());
CREATE POLICY profiles_own_update ON public.user_profiles FOR UPDATE USING(id=auth.uid());
CREATE POLICY profiles_service_all ON public.user_profiles USING(auth.role()='service_role');
CREATE TABLE public.jack_config(id int PRIMARY KEY,value text);
ALTER TABLE public.jack_config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.jack_config TO anon,authenticated,service_role;
CREATE POLICY "Admins can manage jack_config" ON public.jack_config FOR ALL USING(EXISTS(SELECT 1 FROM public.user_profiles WHERE user_profiles.id=auth.uid() AND user_profiles.is_admin=true));
CREATE FUNCTION public.update_politician_verification_tier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_verification_tier AFTER INSERT OR UPDATE OF status ON public.politician_verifications FOR EACH ROW EXECUTE FUNCTION public.update_politician_verification_tier();
\ir ../../migrations/20261031041730_release_rls_hardening.sql
\ir ../../migrations/20261031205615_account_transitions.sql
\ir ../../migrations/20261031205619_launch_security.sql
-- Repeat application must preserve RLS and remain safe.
\ir ../../migrations/20261031205619_launch_security.sql
\ir ../../migrations/20261031205623_portrait_permissions.sql

CREATE FUNCTION public.check_launch(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF condition IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.expect_launch_error(statement text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RAISE NOTICE 'PASS: %',label; RETURN; ELSE RAISE; END IF; END; RAISE EXCEPTION 'FAIL: % did not reject',label; END $$;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-8000-000000000001','admin@example.test'),('00000000-0000-4000-8000-000000000002','visitor@example.test'),('00000000-0000-4000-8000-000000000003','editor@example.test');
INSERT INTO public.user_profiles(id,is_admin) VALUES('00000000-0000-4000-8000-000000000002',true);
INSERT INTO public.jack_config VALUES(1,'private control');
INSERT INTO public.politicians(id,slug,verification_tier) VALUES('10000000-0000-4000-8000-000000000001','verified','2'),('10000000-0000-4000-8000-000000000002','pending','1');
INSERT INTO public.politician_team(politician_id,user_id,role) VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','admin'),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','admin'),('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','editor');
SELECT public.check_launch(NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity),'all production public tables keep RLS');
SELECT public.check_launch(NOT has_column_privilege('authenticated','public.user_profiles','is_admin','UPDATE'),'sensitive column update grant revoked');
SELECT public.check_launch(NOT has_table_privilege('anon','public.user_profiles','TRUNCATE'),'maintenance privileges revoked');
SELECT public.check_launch(NOT has_function_privilege('authenticated','public.consume_security_rate_limit(text,integer,integer)','EXECUTE'),'browser cannot reset shared quotas');
SELECT public.check_launch(NOT has_function_privilege('authenticated','public.replace_verified_portrait(uuid,uuid,text,text,text)','EXECUTE'),'browser cannot impersonate photo actor');
SELECT public.check_launch((SELECT bool_and(has_table_privilege('service_role',ledger,'SELECT') AND has_table_privilege('service_role',ledger,'INSERT') AND NOT has_table_privilege('service_role',ledger,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')) FROM (VALUES('public.politician_account_audit'),('public.politician_photo_history')) ledgers(ledger)),'both ledgers narrow default service grants to read and append');
SET ROLE authenticated;
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002","app_metadata":{}}';
SELECT public.expect_launch_error($$UPDATE public.user_profiles SET is_admin=true WHERE id=auth.uid()$$,'42501','own-row admin escalation denied');
SELECT public.check_launch((SELECT count(*)=0 FROM public.jack_config),'preexisting editable is_admin flag gives no admin access');
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002","app_metadata":{"is_admin":true}}';
SELECT public.check_launch((SELECT count(*)=1 FROM public.jack_config),'server-managed admin claim retains access');
SELECT public.expect_launch_error($$SELECT * FROM public.politician_verification_sources$$,'42501','verification source anchors are private');
SELECT public.expect_launch_error($$SELECT * FROM public.politician_photo_history$$,'42501','portrait uploader history is private');
RESET ROLE;
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
SELECT public.check_launch(public.consume_security_rate_limit('fixture:quota',2,300),'shared quota first request accepted');
SELECT public.check_launch(public.consume_security_rate_limit('fixture:quota',2,300),'shared quota second request accepted');
SELECT public.check_launch(NOT public.consume_security_rate_limit('fixture:quota',2,300),'shared quota third request rejected');
UPDATE public.security_rate_limits SET resets_at=now()-interval '1 second' WHERE key='fixture:quota';
SELECT public.check_launch(public.consume_security_rate_limit('fixture:quota',2,300),'expired shared quota resets');
SELECT public.expect_launch_error($$INSERT INTO public.politician_verifications(politician_id,user_id,method,status,metadata) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','gov_email','completed','{"assurance":"reviewed_source_v1"}')$$,'42501','completion fails without independent source');
INSERT INTO public.politician_verification_sources VALUES('10000000-0000-4000-8000-000000000002','https://pending.senate.gov',ARRAY['pending.senate.gov'],'https://senate.gov/directory',now(),'00000000-0000-4000-8000-000000000001');
SELECT public.expect_launch_error($$INSERT INTO public.politician_verifications(politician_id,user_id,method,status,metadata) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','gov_email','completed','{"assurance":"reviewed_source_v1","email":"person@unrelated.gov","source_url":"https://senate.gov/directory"}')$$,'42501','government email from unrelated office cannot verify');
INSERT INTO public.politician_verifications(politician_id,user_id,method,status,metadata) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','gov_email','completed','{"assurance":"reviewed_source_v1","email":"staff@pending.senate.gov","source_url":"https://senate.gov/directory"}');
SELECT public.check_launch((SELECT verification_tier='1' FROM public.politicians WHERE slug='pending'),'one verified method does not raise tier');
SELECT public.expect_launch_error($$INSERT INTO public.politician_verifications(politician_id,user_id,method,status,metadata) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','meta_tag','completed','{"assurance":"reviewed_source_v1","website_url":"https://attacker.example","source_url":"https://senate.gov/directory"}')$$,'42501','claimant-controlled website cannot verify');
INSERT INTO public.politician_verifications(politician_id,user_id,method,status,metadata) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','meta_tag','completed','{"assurance":"reviewed_source_v1","website_url":"https://pending.senate.gov","source_url":"https://senate.gov/directory"}');
SELECT public.check_launch((SELECT verification_tier='2' FROM public.politicians WHERE slug='pending'),'two reviewed methods raise tier');
SELECT public.expect_launch_error($$INSERT INTO public.politician_verifications(politician_id,user_id,method,status) VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','stripe_identity','completed')$$,'42501','editor cannot complete identity verification');
INSERT INTO public.questions(politician_id,submitted_by,week_number) SELECT '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',public.current_week_number() FROM generate_series(1,3);
SELECT public.expect_launch_error($$INSERT INTO public.questions(politician_id,submitted_by,week_number) VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',public.current_week_number())$$,'P0001','per-profile daily question quota enforced in DB');
INSERT INTO public.questions(politician_id,submitted_by,week_number) SELECT '10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',public.current_week_number() FROM generate_series(1,2);
SELECT public.expect_launch_error($$INSERT INTO public.questions(politician_id,submitted_by,week_number) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',public.current_week_number())$$,'P0001','global daily question quota enforced in DB');
SELECT public.expect_launch_error($$SELECT public.replace_verified_portrait('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','https://fixture.supabase.co/storage/v1/object/public/politician-photos/10000000-0000-4000-8000-000000000001/1234.jpg','Fixture Creator','whytho-portrait-permission-v1')$$,'42501','editor cannot replace portrait');
SELECT public.check_launch(public.replace_verified_portrait('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','https://fixture.supabase.co/storage/v1/object/public/politician-photos/10000000-0000-4000-8000-000000000001/1234.jpg','Fixture Creator','whytho-portrait-permission-v1')='verified','verified admin replaces portrait');
SELECT public.check_launch((SELECT count(*)=1 FROM public.politician_photo_history),'portrait replacement keeps attribution history');
SELECT public.expect_launch_error($$UPDATE public.politician_photo_history SET credit='tampered' WHERE false$$,'42501','service role cannot rewrite portrait history');
RESET ROLE;
