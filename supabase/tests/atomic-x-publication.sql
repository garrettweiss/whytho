\set ON_ERROR_STOP on
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE TABLE public.politicians(id uuid PRIMARY KEY,slug text,canonical_politician_id uuid,is_active boolean DEFAULT true,is_test boolean DEFAULT false);
CREATE TABLE public.x_posts(id uuid PRIMARY KEY,politician_id uuid,whytho_question_id uuid,status text,updated_at timestamptz);
CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid,week_number integer,body text CHECK(char_length(body) BETWEEN 10 AND 500),source text,is_seeded boolean,submitted_by uuid,x_post_id uuid,status text,net_upvotes integer);
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
CREATE FUNCTION public.current_week_number() RETURNS integer LANGUAGE sql AS $$ SELECT 202648 $$;
CREATE FUNCTION public.canonical_politician_id(p_id uuid) RETURNS uuid LANGUAGE sql AS $$
 SELECT coalesce(p.canonical_politician_id,p.id) FROM public.politicians p WHERE p.id=p_id
$$;
CREATE FUNCTION public.resolve_politician_identity(p_id uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('canonical_id',public.canonical_politician_id(p_id))
$$;
INSERT INTO public.politicians(id,slug) VALUES
 ('10000000-0000-4000-8000-000000000001','canonical'),('10000000-0000-4000-8000-000000000003','unrelated');
INSERT INTO public.politicians(id,slug,canonical_politician_id) VALUES('10000000-0000-4000-8000-000000000002','source','10000000-0000-4000-8000-000000000001');
INSERT INTO public.politicians(id,slug,is_active,is_test) VALUES
 ('10000000-0000-4000-8000-000000000004','inactive',false,false),
 ('10000000-0000-4000-8000-000000000005','test-profile',true,true);
INSERT INTO public.x_posts(id,politician_id,status) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','approved'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','approved'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','pending'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','approved'),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','approved'),
 ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000004','approved'),
 ('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000005','approved');
INSERT INTO public.questions(id,politician_id,week_number,body,source,is_seeded,x_post_id,status,net_upvotes) VALUES
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',202612,'Legacy source question stays unchanged','x',false,'20000000-0000-4000-8000-000000000002','active',7);
\if :duplicate_fixture
INSERT INTO public.questions(politician_id,week_number,body,source,is_seeded,x_post_id,status,net_upvotes) VALUES
 ('10000000-0000-4000-8000-000000000002',202612,'Historical duplicate one retained','x',false,'20000000-0000-4000-8000-000000000005','active',0),
 ('10000000-0000-4000-8000-000000000002',202612,'Historical duplicate two retained','x',false,'20000000-0000-4000-8000-000000000005','active',0);
\endif
\ir ../migrations/20261123032045_atomic_x_publication.sql
CREATE FUNCTION public.check_expectation(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
SET ROLE service_role;
SELECT public.check_expectation((public.publish_x_post('20000000-0000-4000-8000-000000000001','A new question for the public record',202648)->>'published')::boolean,'approved post publishes');
SELECT public.check_expectation(NOT (public.publish_x_post('20000000-0000-4000-8000-000000000001','A retry cannot replace existing content',202648)->>'published')::boolean,'retry retains existing publication');
SELECT public.check_expectation((SELECT politician_id FROM public.questions WHERE x_post_id='20000000-0000-4000-8000-000000000001')='10000000-0000-4000-8000-000000000001','new question belongs to canonical profile');
SELECT public.check_expectation((SELECT politician_id FROM public.x_posts WHERE id='20000000-0000-4000-8000-000000000001')='10000000-0000-4000-8000-000000000002','source attribution remains on original profile');
SELECT public.check_expectation((SELECT body FROM public.questions WHERE x_post_id='20000000-0000-4000-8000-000000000001')='A new question for the public record','retry cannot rewrite question body');
UPDATE public.x_posts SET status='notified' WHERE id='20000000-0000-4000-8000-000000000001';
SELECT public.publish_x_post('20000000-0000-4000-8000-000000000001','Another retry retains notified state',202648);
SELECT public.check_expectation((SELECT status FROM public.x_posts WHERE id='20000000-0000-4000-8000-000000000001')='notified','replay preserves notified state');
SELECT public.check_expectation((public.publish_x_post('20000000-0000-4000-8000-000000000002','The replacement is never used',202648)->>'question_id')='30000000-0000-4000-8000-000000000002','legacy partial write is recovered by ID');
SELECT public.check_expectation((SELECT politician_id='10000000-0000-4000-8000-000000000002' AND net_upvotes=7 AND week_number=202612 FROM public.questions WHERE id='30000000-0000-4000-8000-000000000002'),'legacy source ID, votes and week are unchanged');
DO $$ BEGIN
 BEGIN PERFORM public.publish_x_post('20000000-0000-4000-8000-000000000003','A pending post must stay pending',202648);
 EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'PASS: pending post rejected'; RETURN; END;
 RAISE EXCEPTION 'FAIL: pending post published'; END $$;
DO $$ BEGIN
 BEGIN PERFORM public.publish_x_post('20000000-0000-4000-8000-000000000007','Inactive root cannot receive new publication',202648);
 EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'PASS: inactive root rejected'; RETURN; END;
 RAISE EXCEPTION 'FAIL: inactive root published'; END $$;
DO $$ BEGIN
 BEGIN PERFORM public.publish_x_post('20000000-0000-4000-8000-000000000008','Test root cannot receive X publication',202648);
 EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'PASS: test root rejected'; RETURN; END;
 RAISE EXCEPTION 'FAIL: test root published'; END $$;
DO $$ BEGIN
 BEGIN INSERT INTO public.questions(politician_id,body,x_post_id) VALUES('10000000-0000-4000-8000-000000000001','Duplicate source must be rejected','20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: direct duplicate binding rejected'; RETURN; END;
 RAISE EXCEPTION 'FAIL: duplicate inserted'; END $$;
RESET ROLE;
CREATE FUNCTION public.reject_test_post_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id='20000000-0000-4000-8000-000000000004' THEN RAISE EXCEPTION 'fixture update failure' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER fixture_post_failure BEFORE UPDATE ON public.x_posts FOR EACH ROW EXECUTE FUNCTION public.reject_test_post_update();
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.publish_x_post('20000000-0000-4000-8000-000000000004','A failed link rolls back its question',202648);
 EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: injected link failure raised'; RETURN; END;
 RAISE EXCEPTION 'FAIL: expected link failure'; END $$;
SELECT public.check_expectation(NOT EXISTS(SELECT 1 FROM public.questions WHERE x_post_id='20000000-0000-4000-8000-000000000004'),'failed link leaves no orphan question');
SELECT public.check_expectation((SELECT status='approved' AND whytho_question_id IS NULL FROM public.x_posts WHERE id='20000000-0000-4000-8000-000000000004'),'failed transaction preserves queue state');
RESET ROLE;
SELECT public.check_expectation(NOT has_function_privilege('anon','public.publish_x_post(uuid,text,integer)','execute'),'anonymous cannot publish');
SELECT public.check_expectation(NOT has_function_privilege('authenticated','public.publish_x_post(uuid,text,integer)','execute'),'signed-in browser cannot publish');
\if :duplicate_fixture
SELECT public.check_expectation((SELECT count(*) FROM public.questions WHERE x_post_id='20000000-0000-4000-8000-000000000005')=2,'historical duplicate rows retained');
SELECT public.check_expectation(to_regclass('public.questions_one_x_post_idx') IS NULL,'unique index deferred without destroying duplicates');
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.publish_x_post('20000000-0000-4000-8000-000000000005','Ambiguous history needs review',202648);
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: ambiguous historical source rejected'; RETURN; END;
 RAISE EXCEPTION 'FAIL: ambiguous source published'; END $$;
RESET ROLE;
\else
SELECT public.check_expectation(to_regclass('public.questions_one_x_post_idx') IS NOT NULL,'clean history gets unique X binding index');
\endif
