-- Synthetic fixtures only. Run with scripts/test-account-database.sh.
-- Every scenario executes actual PostgreSQL function code, not an RPC mock.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
-- Reproduce Supabase's real default grants for tables created by postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,is_anonymous boolean DEFAULT false);
CREATE TYPE public.politician_team_role AS ENUM ('admin','editor','responder');
CREATE TYPE public.answer_type AS ENUM ('direct','team_statement','ai_analysis');
CREATE TABLE public.politicians(id uuid PRIMARY KEY,full_name text,slug text,verification_tier text,is_active boolean DEFAULT true);
CREATE TABLE public.politician_team(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,user_id uuid REFERENCES auth.users,role public.politician_team_role,invited_by uuid,created_at timestamptz DEFAULT now(),UNIQUE(politician_id,user_id));
CREATE TABLE public.questions(id uuid PRIMARY KEY,politician_id uuid REFERENCES public.politicians,status text DEFAULT 'active',week_number int DEFAULT 202644);
CREATE TABLE public.answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid REFERENCES public.questions,politician_id uuid REFERENCES public.politicians,week_number int,body text,sources jsonb,answer_type public.answer_type,is_draft boolean,is_ai_generated boolean,is_disputed boolean,published_by uuid,created_at timestamptz DEFAULT now());
GRANT USAGE ON SCHEMA public,auth TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
\ir ../migrations/20261031205615_account_transitions.sql
CREATE FUNCTION public.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.expect_error(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RAISE NOTICE 'PASS: %',label; RETURN; ELSE RAISE EXCEPTION 'FAIL: % expected % got % (%)',label,expected,SQLSTATE,SQLERRM; END IF; END; RAISE EXCEPTION 'FAIL: % unexpectedly succeeded',label; END $$;
-- ids end in 1=admin, 2=editor, 3=responder, 4=outsider, 5=anonymous, 6=other admin, 7=pending, 8=second admin.
INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'persona'||n||'@example.test',n=5 FROM generate_series(1,8) n;
INSERT INTO public.politicians VALUES('10000000-0000-4000-8000-000000000001','Verified','verified','2',true),('10000000-0000-4000-8000-000000000002','Other','other','2',true),('10000000-0000-4000-8000-000000000003','Unclaimed','unclaimed','0',true);
INSERT INTO public.politician_team(politician_id,user_id,role) SELECT '10000000-0000-4000-8000-000000000001',id,CASE right(id::text,1) WHEN '1' THEN 'admin'::public.politician_team_role WHEN '2' THEN 'editor'::public.politician_team_role ELSE 'responder'::public.politician_team_role END FROM auth.users WHERE right(id::text,1) IN ('1','2','3');
INSERT INTO public.politician_team(politician_id,user_id,role) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006','admin');
INSERT INTO public.questions SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=3 THEN '10000000-0000-4000-8000-000000000003'::uuid ELSE '10000000-0000-4000-8000-000000000001'::uuid END,'active',202644 FROM generate_series(1,5)n;
SELECT public.assert_true(NOT has_function_privilege('anon','public.claim_politician_profile(uuid,uuid)','execute'),'visitor cannot call claim RPC');
SELECT public.assert_true(NOT has_function_privilege('authenticated','public.manage_politician_team(uuid,uuid,text,uuid,text,text)','execute'),'ordinary user cannot bypass API to call team RPC');
SELECT public.assert_true(NOT has_function_privilege('authenticated','public.save_politician_answer(uuid,text,uuid,uuid,text,jsonb,text)','execute'),'browser cannot impersonate actor in answer RPC');
-- Match production: service_role has auth schema usage but cannot read the user table.
SELECT public.assert_true(NOT has_table_privilege('service_role','auth.users','select'),'service role has no broad auth.users read grant');
SELECT public.assert_true(has_table_privilege('service_role','public.politician_account_audit','SELECT') AND has_table_privilege('service_role','public.politician_account_audit','INSERT'),'service role retains audit read and append');
SELECT public.assert_true(NOT has_table_privilege('service_role','public.politician_account_audit','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),'audit defaults narrowed to append-only service role');
SELECT public.assert_true((SELECT bool_and(p.prosecdef AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=pg_catalog']) FROM pg_proc p WHERE p.oid IN ('public.claim_politician_profile(uuid,uuid)'::regprocedure,'public.manage_politician_team(uuid,uuid,text,uuid,text,text)'::regprocedure,'public.save_politician_answer(uuid,text,uuid,uuid,text,jsonb,text)'::regprocedure)),'account RPCs have fixed privileged owner and safe search path');
SELECT public.assert_true((SELECT bool_and(NOT has_function_privilege(r.role,p.oid,'execute')) FROM pg_proc p CROSS JOIN (VALUES ('anon'),('authenticated')) r(role) WHERE p.oid IN ('public.claim_politician_profile(uuid,uuid)'::regprocedure,'public.manage_politician_team(uuid,uuid,text,uuid,text,text)'::regprocedure,'public.save_politician_answer(uuid,text,uuid,uuid,text,jsonb,text)'::regprocedure)),'all browser roles denied all account RPCs');
SET ROLE anon;
SELECT public.expect_error($$SELECT public.claim_politician_profile('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003')$$,'42501','visitor cannot execute claim with forged actor');
RESET ROLE;
SET ROLE authenticated;
SELECT public.expect_error($$SELECT public.manage_politician_team('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','add',NULL,'persona8@example.test','admin')$$,'42501','browser cannot execute privileged team operation');
SELECT public.expect_error($$SELECT public.save_politician_answer('00000000-0000-4000-8000-000000000001','create','20000000-0000-4000-8000-000000000001',NULL,'Forged administrator response')$$,'42501','browser cannot execute privileged publish operation');
RESET ROLE;
SET ROLE service_role;
SELECT public.expect_error($$UPDATE public.politician_account_audit SET action='tampered' WHERE false$$,'42501','service role cannot rewrite audit history');
SELECT public.expect_error($$SELECT public.claim_politician_profile('00000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000003')$$,'42501','anonymous claim denied');
SELECT public.assert_true((public.claim_politician_profile('00000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000003')->>'resumed')='false','new applicant claims profile');
SELECT public.assert_true((public.claim_politician_profile('00000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000003')->>'resumed')='true','pending admin resumes idempotently');
SELECT public.expect_error($$SELECT public.claim_politician_profile('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003')$$,'23505','second claimant cannot seize profile');
SELECT public.expect_error($$SELECT public.manage_politician_team('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','add',NULL,'persona8@example.test','admin')$$,'42501','editor cannot invite');
SELECT public.expect_error(format('SELECT public.manage_politician_team(%L,%L,%L,%L)', '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','remove',(SELECT id FROM public.politician_team WHERE user_id='00000000-0000-4000-8000-000000000006')),'P0002','admin cannot remove another profile member');
SELECT public.expect_error($$SELECT public.manage_politician_team('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','disconnect')$$,'22023','last admin cannot disconnect');
SELECT public.expect_error(format('SELECT public.manage_politician_team(%L,%L,%L,%L,NULL,%L)','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','role',(SELECT id FROM public.politician_team WHERE user_id='00000000-0000-4000-8000-000000000001'),'editor'),'22023','last admin cannot demote self');
SELECT public.assert_true((public.manage_politician_team('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','add',NULL,' PERSONA8@example.test ','admin')->>'success')='true','admin adds existing account with normalized email');
SELECT public.assert_true((public.manage_politician_team('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','role',(SELECT id FROM public.politician_team WHERE user_id='00000000-0000-4000-8000-000000000008'),NULL,'editor')->>'success')='true','admin changes staff role');
SELECT public.assert_true((public.save_politician_answer('00000000-0000-4000-8000-000000000003','create','20000000-0000-4000-8000-000000000001',NULL,'Responder draft response')->>'is_draft')='true','responder creates private draft');
SELECT public.assert_true((public.save_politician_answer('00000000-0000-4000-8000-000000000007','create','20000000-0000-4000-8000-000000000003',NULL,'Pending admin response')->>'is_draft')='true','unverified admin can only draft');
SELECT public.expect_error($$SELECT public.save_politician_answer('00000000-0000-4000-8000-000000000006','create','20000000-0000-4000-8000-000000000001',NULL,'Other profile admin response')$$,'42501','unrelated admin cannot respond');
SELECT public.expect_error($$SELECT public.save_politician_answer('00000000-0000-4000-8000-000000000004','create','20000000-0000-4000-8000-000000000001',NULL,'Ordinary visitor response')$$,'42501','ordinary user cannot respond');
SELECT public.expect_error(format('SELECT public.save_politician_answer(%L,%L,NULL,%L)','00000000-0000-4000-8000-000000000003','approve',(SELECT id FROM public.answers WHERE question_id='20000000-0000-4000-8000-000000000001')),'42501','responder cannot approve own draft');
SELECT public.expect_error(format('SELECT public.save_politician_answer(%L,%L,NULL,%L)','00000000-0000-4000-8000-000000000007','approve',(SELECT id FROM public.answers WHERE question_id='20000000-0000-4000-8000-000000000003')),'42501','pending admin cannot approve own draft');
UPDATE public.answers SET created_at=now()-interval '1 day';
SELECT public.assert_true((public.save_politician_answer('00000000-0000-4000-8000-000000000003','edit',NULL,(SELECT id FROM public.answers WHERE question_id='20000000-0000-4000-8000-000000000001'),'Updated private draft response')->>'success')='true','responder can resume and edit an older private draft');
SELECT public.assert_true((public.save_politician_answer('00000000-0000-4000-8000-000000000002','approve',NULL,(SELECT id FROM public.answers WHERE question_id='20000000-0000-4000-8000-000000000001'))->>'is_draft')='false','verified editor approves draft');
SELECT public.assert_true((public.save_politician_answer('00000000-0000-4000-8000-000000000002','edit',NULL,(SELECT id FROM public.answers WHERE question_id='20000000-0000-4000-8000-000000000001'),'Editor corrects newly published response')->>'success')='true','newly approved old draft has a fresh edit window');
SELECT public.expect_error(format('SELECT public.save_politician_answer(%L,%L,NULL,%L,%L)','00000000-0000-4000-8000-000000000003','edit',(SELECT id FROM public.answers WHERE question_id='20000000-0000-4000-8000-000000000001'),'Responder overwrites live response'),'42501','responder cannot edit after approval');
SELECT public.expect_error($$SELECT public.save_politician_answer('00000000-0000-4000-8000-000000000001','create','20000000-0000-4000-8000-000000000001',NULL,'Competing official response')$$,'23505','cannot publish duplicate official response');
SELECT public.assert_true((public.save_politician_answer('00000000-0000-4000-8000-000000000002','create','20000000-0000-4000-8000-000000000002',NULL,'Verified editor direct response')->>'is_draft')='false','verified editor publishes directly');
SELECT public.assert_true((public.save_politician_answer('00000000-0000-4000-8000-000000000001','create','20000000-0000-4000-8000-000000000004',NULL,'Admin prepares private response','[]','team_statement')->>'is_draft')='true','verified admin can choose a private draft');
SELECT public.assert_true((public.manage_politician_team('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','remove',(SELECT id FROM public.politician_team WHERE user_id='00000000-0000-4000-8000-000000000003'))->>'success')='true','admin revokes responder membership');
SELECT public.expect_error($$SELECT public.save_politician_answer('00000000-0000-4000-8000-000000000003','create','20000000-0000-4000-8000-000000000004',NULL,'Removed member response')$$,'42501','removed member cannot respond');
SELECT public.assert_true((public.manage_politician_team('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','disconnect')->>'success')='true','editor can disconnect own account');
SELECT public.assert_true((SELECT verification_tier='2' FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000001'),'staff disconnect preserves verified profile');
RESET ROLE;

SELECT public.assert_true((SELECT count(*) FROM public.politician_account_audit WHERE action='answer_approve')=1,'approval actor is retained in private audit history');
SELECT public.assert_true(NOT has_table_privilege('authenticated','public.politician_account_audit','select'),'audit actor history is private');
SELECT public.assert_true((SELECT relrowsecurity FROM pg_class WHERE oid='public.politician_account_audit'::regclass),'account audit has RLS');
-- Safe repeat application preserves schema, functions and existing history.
\ir ../migrations/20261031205615_account_transitions.sql
SELECT public.assert_true((SELECT count(*) FROM public.politician_account_audit WHERE action='answer_approve')=1,'repeat migration preserves audit history');
SELECT public.assert_true(NOT has_table_privilege('service_role','public.politician_account_audit','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),'repeat migration preserves append-only audit grants');

INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000009','claim-limit@example.test',false);
INSERT INTO public.politicians SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Limit '||n,'limit-'||n,'0',true FROM generate_series(11,16)n;
SET ROLE service_role;
SELECT public.claim_politician_profile('00000000-0000-4000-8000-000000000009',('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid) FROM generate_series(11,15)n;
SELECT public.expect_error($$SELECT public.claim_politician_profile('00000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000016')$$,'22023','sixth concurrent pending claim is refused');
SELECT public.assert_true((public.claim_politician_profile('00000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000011')->>'resumed')='true','pending claim cap does not block resumption');
RESET ROLE;
