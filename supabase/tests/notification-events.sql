-- Minimal synthetic representation of the actual publication columns/defaults.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean DEFAULT false,email_confirmed_at timestamptz);
CREATE TABLE public.politicians(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true,is_test boolean NOT NULL DEFAULT false);
CREATE TYPE public.question_status AS ENUM('active','removed','merged');
CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid NOT NULL REFERENCES public.politicians,
  status public.question_status NOT NULL DEFAULT 'active',source text NOT NULL DEFAULT 'user',is_seeded boolean NOT NULL DEFAULT false,
  submitted_by uuid REFERENCES auth.users,created_at timestamptz NOT NULL DEFAULT now(),x_post_id uuid);
CREATE FUNCTION public.assert_true(v boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.expect_error(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RAISE NOTICE 'PASS: %',label; RETURN; END IF; RAISE; END; RAISE EXCEPTION 'FAIL: % unexpectedly succeeded',label; END $$;
INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001',false,now()),('00000000-0000-4000-8000-000000000002',true,now()),('00000000-0000-4000-8000-000000000003',false,NULL);
INSERT INTO public.politicians VALUES('10000000-0000-4000-8000-000000000001',true,false),('10000000-0000-4000-8000-000000000002',true,true),('10000000-0000-4000-8000-000000000003',false,false);
-- Existing rows are never retroactively queued on migration application.
INSERT INTO public.questions(id,politician_id,submitted_by) VALUES('20000000-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
\ir ../migrations/20261119000100_question_notification_events.sql
SELECT public.assert_true((SELECT count(*)=0 FROM public.question_notification_events),'historical rows not backfilled');
INSERT INTO public.questions(id,politician_id,submitted_by) VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
SELECT public.assert_true((SELECT count(*)=1 AND bool_and(event_key='question-created:'||question_id::text) FROM public.question_notification_events),'human publication atomically enqueues canonical event');
-- Seeded, imported, anonymous/unconfirmed, unattributed, inactive and test profiles excluded.
INSERT INTO public.questions(politician_id,submitted_by,source,is_seeded,x_post_id,status)
SELECT p,u,s,seed,x,st::public.question_status FROM (VALUES
 ('10000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000001'::uuid,'user',true,NULL::uuid,'active'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','x',false,NULL,'active'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','user',false,NULL,'active'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','user',false,NULL,'active'),
 ('10000000-0000-4000-8000-000000000001',NULL,'user',false,NULL,'active'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','user',false,NULL,'active'),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','user',false,NULL,'active'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','user',false,'30000000-0000-4000-8000-000000000001','active'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','user',false,NULL,'removed')
) t(p,u,s,seed,x,st);
SELECT public.assert_true((SELECT count(*)=1 FROM public.question_notification_events),'all ineligible publications excluded');
INSERT INTO public.questions(id,politician_id,submitted_by,status) VALUES('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','removed');
UPDATE public.questions SET status='active' WHERE id='20000000-0000-4000-8000-000000000002';
UPDATE public.questions SET status='removed' WHERE id='20000000-0000-4000-8000-000000000002';
UPDATE public.questions SET status='active' WHERE id='20000000-0000-4000-8000-000000000002';
SELECT public.assert_true((SELECT count(*)=2 FROM public.question_notification_events),'publication transitions deduplicate');
-- A rolled-back question must not leave an event.
BEGIN;
INSERT INTO public.questions(id,politician_id,submitted_by) VALUES('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
ROLLBACK;
SELECT public.assert_true((SELECT count(*)=2 FROM public.question_notification_events),'rollback cannot leave orphan notification');
SELECT public.assert_true((SELECT relrowsecurity FROM pg_class WHERE oid='public.question_notification_events'::regclass),'event ledger RLS enabled');
SELECT public.assert_true(NOT has_table_privilege('anon','public.question_notification_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'anonymous role has no ledger access');
SELECT public.assert_true(NOT has_table_privilege('authenticated','public.question_notification_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'browser role has no ledger access');
SELECT public.assert_true(has_table_privilege('service_role','public.question_notification_events','SELECT') AND NOT has_table_privilege('service_role','public.question_notification_events','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'),'service role can only read ledger');
SELECT public.assert_true(NOT has_function_privilege('authenticated','public.record_question_notification_event()','EXECUTE'),'browser cannot execute privileged event function');
SET ROLE authenticated;
SELECT public.expect_error('SELECT * FROM public.question_notification_events','42501','actual browser ledger read denied');
RESET ROLE;
SET ROLE service_role;
SELECT public.expect_error('INSERT INTO public.question_notification_events(question_id,politician_id,question_created_at) VALUES(gen_random_uuid(),gen_random_uuid(),now())','42501','service role cannot forge an event');
SELECT public.expect_error('UPDATE public.question_notification_events SET schema_version=1','42501','service role cannot rewrite events');
RESET ROLE;
SELECT public.expect_error($q$UPDATE public.questions SET politician_id='10000000-0000-4000-8000-000000000002' WHERE id='20000000-0000-4000-8000-000000000001'$q$,'23503','event cannot be rebound to another politician');
\ir ../migrations/20261119000100_question_notification_events.sql
SELECT public.assert_true((SELECT count(*)=2 FROM public.question_notification_events),'repeat migration preserves existing events');
