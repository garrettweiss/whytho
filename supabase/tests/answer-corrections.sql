\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean DEFAULT false);
CREATE TYPE public.politician_team_role AS ENUM ('admin','editor','responder');
CREATE TYPE public.answer_type AS ENUM ('direct','team_statement','ai_analysis');
CREATE TABLE public.politicians(id uuid PRIMARY KEY,verification_tier text);
CREATE TABLE public.questions(id uuid PRIMARY KEY,politician_id uuid REFERENCES public.politicians,status text);
CREATE TABLE public.politician_team(politician_id uuid REFERENCES public.politicians,user_id uuid REFERENCES auth.users,role public.politician_team_role,PRIMARY KEY(politician_id,user_id));
CREATE TABLE public.answers(id uuid PRIMARY KEY,question_id uuid REFERENCES public.questions,politician_id uuid REFERENCES public.politicians,body text,sources jsonb,answer_type public.answer_type,is_draft boolean,is_ai_generated boolean,is_disputed boolean,created_at timestamptz);
CREATE TABLE public.politician_account_audit(politician_id uuid,actor_id uuid,action text,subject_id uuid,details jsonb);
\ir ../migrations/20261122000200_answer_corrections.sql

CREATE FUNCTION public.check_expectation(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END $$;

INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000001');
INSERT INTO public.politicians VALUES('10000000-0000-4000-8000-000000000001','2');
INSERT INTO public.politician_team VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','editor');
INSERT INTO public.questions VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active');
INSERT INTO public.answers VALUES
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Original official response','[]','team_statement',false,false,false,now()-interval '2 months'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Original private draft','[]','team_statement',true,false,false,now());

\set actor '00000000-0000-4000-8000-000000000001'
\set answer '30000000-0000-4000-8000-000000000001'
\set first '40000000-0000-4000-8000-000000000001'
\set second '40000000-0000-4000-8000-000000000002'
SET ROLE service_role;
SELECT public.check_expectation((public.publish_answer_correction(:'actor',:'answer',:'first','First dated correction')->>'correction_id')=:'first','verified editor can correct an older official answer');
SELECT public.check_expectation((public.publish_answer_correction(:'actor',:'answer',:'first','First dated correction')->>'correction_id')=:'first','retry returns the same correction');
SELECT public.check_expectation((public.publish_answer_correction(:'actor',:'answer',:'second','A later correction')->>'correction_id')=:'second','a second correction is appended');
RESET ROLE;
SELECT public.check_expectation((SELECT body FROM public.answers WHERE id=:'answer')='Original official response','original response remains intact');
SELECT public.check_expectation((SELECT count(*) FROM public.answer_corrections WHERE answer_id=:'answer')=2,'history contains both corrections without duplicating the retry');
SELECT public.check_expectation((SELECT count(*) FROM public.politician_account_audit WHERE action='answer_correction_publish')=2,'private audit records each correction once');
SELECT public.check_expectation(NOT has_table_privilege('anon','public.answer_corrections','INSERT,UPDATE,DELETE'),'public correction history is read-only');
SELECT public.check_expectation(NOT has_table_privilege('service_role','public.answer_corrections','INSERT,UPDATE,DELETE'),'service correction writes use the authorized RPC');
SELECT public.check_expectation(NOT has_function_privilege('authenticated','public.publish_answer_correction(uuid,uuid,uuid,text)','execute'),'browser role cannot call the correction RPC directly');

SET ROLE anon;
SELECT public.check_expectation((SELECT count(*) FROM public.answer_corrections)=2,'visitor can read corrections to a public answer');
RESET ROLE;
UPDATE public.questions SET status='removed' WHERE id='20000000-0000-4000-8000-000000000001';
SET ROLE anon;
SELECT public.check_expectation((SELECT count(*) FROM public.answer_corrections)=0,'corrections follow the question visibility decision');
RESET ROLE;
SELECT public.check_expectation((SELECT count(*) FROM public.answer_corrections)=2,'restricting visibility retains the correction history');
UPDATE public.answers SET body='Updated private draft' WHERE id='30000000-0000-4000-8000-000000000002';
SELECT public.check_expectation((SELECT body FROM public.answers WHERE id='30000000-0000-4000-8000-000000000002')='Updated private draft','draft still supports editing');

DO $$
BEGIN
  BEGIN
    UPDATE public.answers SET body='Replacing the original published response'
      WHERE id='30000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'PASS: published response wording is immutable';
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL: published wording was replaced';
END $$;
