\ir politician-identities-fixture.sql
CREATE FUNCTION public.current_week_number() RETURNS integer LANGUAGE sql STABLE AS $$SELECT 202648$$;
\ir ../migrations/20261123031955_politician_identities.sql
\ir ../migrations/20261123032045_atomic_x_publication.sql
CREATE FUNCTION public.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
INSERT INTO public.politicians(id,slug,full_name,state,bioguide_id) VALUES('10000000-0000-4000-8000-000000000001','live-base-original','Same Person','New York','Q000001');
INSERT INTO public.politicians(id,slug,full_name,state,candidate_fec_id,is_candidate) VALUES('10000000-0000-4000-8000-000000000002','live-base-candidate','Same Person','NY','H0NY12345',true);
INSERT INTO public.questions(id,politician_id,net_upvotes) VALUES('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',10);
SET ROLE service_role;
SELECT public.link_politician_identity('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
 (SELECT updated_at FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000002'),
 (SELECT updated_at FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000001'),
 public.politician_identity_dependency_counts(ARRAY['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid]),
 gen_random_uuid(),'Local reviewer','{"approved_to_apply":true,"source_urls":["https://example.test/proof"]}','{}');
SELECT public.assert_true((public.ingest_politician_identity('fec.candidate','H0NY12345','{"full_name":"Same Person","state":"NY","office":"U.S. Representative"}',NULL,true)->>'canonical_slug')='live-base-original','ingest works without pending November schemas');
RESET ROLE;
SET ROLE anon;
SELECT public.assert_true(public.identity_profile_summary('10000000-0000-4000-8000-000000000002','week',202648)->>'qualifying_questions'='1','public summary works with live migration dependencies only');
SELECT public.assert_true(cardinality(public.identity_profile_question_ids('10000000-0000-4000-8000-000000000001','week',202648))=1,'public question IDs work without corrections migration');
SELECT public.assert_true(public.identity_directory_counts(ARRAY['10000000-0000-4000-8000-000000000001'::uuid],202648)->0->>'questions'='1','directory counts work without notification migration');
RESET ROLE;
SELECT public.assert_true(to_regclass('public.question_notification_events') IS NULL AND to_regclass('public.answer_corrections') IS NULL,'identity migration does not implicitly create unrelated schemas');
