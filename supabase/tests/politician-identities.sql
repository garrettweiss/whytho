\ir politician-identities-fixture.sql
\ir ../migrations/20261119000100_question_notification_events.sql
\ir ../migrations/20261122000100_politician_notification_preferences.sql
\ir ../migrations/20261122000200_answer_corrections.sql
CREATE FUNCTION public.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.expect_error(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RAISE NOTICE 'PASS: %',label; RETURN; ELSE RAISE EXCEPTION 'FAIL: % expected % got % (%)',label,expected,SQLSTATE,SQLERRM; END IF; END; RAISE EXCEPTION 'FAIL: % unexpectedly succeeded',label; END $$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('00000000-0000-4000-8000-000000000001','identity@example.test',now());
INSERT INTO public.politicians(id,slug,full_name,state,office,district,bioguide_id,photo_url,social_handles) VALUES
 ('10000000-0000-4000-8000-000000000001','alexandria-original','Alexandria Ocasio-Cortez','New York','U.S. Representative','14','O000172','https://example.test/portrait.jpg','{"twitter":"RepAOC"}');
INSERT INTO public.politicians(id,slug,full_name,state,office,district,candidate_fec_id,party,is_candidate,aliases) VALUES
 ('10000000-0000-4000-8000-000000000002','alexandria-candidate','Alexandria Ocasio-Cortez','NY','U.S. Representative','14','H8NY15148','Democrat',true,ARRAY['Candidate AOC']);
INSERT INTO public.politician_aliases(politician_id,alias,alias_type) VALUES('10000000-0000-4000-8000-000000000002','AOC','nickname');
INSERT INTO public.politicians(id,slug,full_name,state) SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fixture-'||n,'Distinct Fixture '||n,'NY' FROM generate_series(3,20)n;
UPDATE public.politicians SET is_test=true WHERE id='10000000-0000-4000-8000-000000000020';
INSERT INTO public.questions(id,politician_id,week_number,net_upvotes,submitted_by) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',202648,10,'00000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',202648,11,'00000000-0000-4000-8000-000000000001');
INSERT INTO public.weekly_snapshots(politician_id,week_number,total_questions,qualifying_questions,answered_qualifying)
 SELECT p,202648-n,1,1,0 FROM generate_series(1,10)n CROSS JOIN unnest(ARRAY['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid]) p;
INSERT INTO public.votes(question_id,user_id,week_number) VALUES('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',202648);
INSERT INTO public.x_posts(politician_id,tweet_id,status) VALUES('10000000-0000-4000-8000-000000000002','synthetic-tweet','pending');
INSERT INTO public.x_outreach_log(politician_id) VALUES('10000000-0000-4000-8000-000000000002');
CREATE FUNCTION public.current_week_number() RETURNS integer LANGUAGE sql STABLE AS $$SELECT 202648$$;
\ir ../migrations/20261123031955_politician_identities.sql
CREATE TRIGGER questions_enforce_submission_limit BEFORE INSERT ON public.questions FOR EACH ROW EXECUTE FUNCTION public.enforce_question_submission_limit();
SELECT public.assert_true(NOT EXISTS(SELECT 1 FROM public.politicians WHERE canonical_politician_id IS NOT NULL),'migration starts with zero approved links');
SET ROLE anon;
SELECT public.assert_true(public.resolve_politician_identity('10000000-0000-4000-8000-000000000020')->>'canonical_slug'='fixture-20','direct QA profile still resolves');
SELECT public.assert_true(public.resolve_politician_identity('99999999-0000-4000-8000-000000000000') IS NULL,'missing public identity is distinct from an error');
SELECT public.expect_error('SELECT * FROM public.politician_identity_decisions','42501','private identity audit inaccessible');
SELECT public.expect_error($$SELECT public.ingest_politician_identity('congress.bioguide','A999999','{}')$$,'42501','browser cannot execute actorless import RPC');
RESET ROLE;
SELECT public.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('public.politician_identity_decisions'::regclass,'public.politician_external_identifiers'::regclass,'public.politician_identity_observations'::regclass)),'all new identity tables have RLS');
SELECT public.assert_true(NOT has_table_privilege('service_role','public.politician_identity_decisions','INSERT,UPDATE,DELETE,TRUNCATE'),'service cannot forge identity audit rows');
SELECT public.assert_true(NOT has_function_privilege('authenticated','public.link_politician_identity(uuid,uuid,timestamptz,timestamptz,jsonb,uuid,text,jsonb,jsonb)','EXECUTE'),'link decisions unavailable to browser roles');
-- Helper constructs a concrete reviewed link; tests use explicit synthetic approvals.
CREATE FUNCTION public.test_link(source uuid,target uuid,decision uuid DEFAULT gen_random_uuid(),fields jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.link_politician_identity(source,target,(SELECT updated_at FROM public.politicians WHERE id=source),
  (SELECT updated_at FROM public.politicians WHERE id=target),public.politician_identity_dependency_counts(ARRAY(SELECT id FROM public.politicians WHERE id IN(source,target) OR canonical_politician_id=target)),
  decision,'Synthetic reviewer','{"approved_to_apply":true,"source_urls":["https://example.test/identity-proof"]}',fields)
$$;
SET ROLE service_role;
SELECT public.expect_error($$UPDATE public.politicians SET canonical_politician_id='10000000-0000-4000-8000-000000000001' WHERE id='10000000-0000-4000-8000-000000000002'$$,'42501','direct mapping changes rejected');
SELECT public.expect_error($$SELECT public.link_politician_identity('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','2000-01-01','2000-01-01','{}',gen_random_uuid(),'Test','{"approved_to_apply":true,"source_urls":["https://example.test"]}')$$,'40001','stale profile versions rejected');
SELECT public.expect_error($$SELECT public.link_politician_identity('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',(SELECT updated_at FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000002'),(SELECT updated_at FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000001'),'{}',gen_random_uuid(),'Test','{"approved_to_apply":true,"source_urls":["https://example.test"]}')$$,'40001','changed dependency counts rejected');
SELECT public.assert_true(public.test_link('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"party":"Democrat"}')->>'canonical_slug'='alexandria-original','approved AOC link retains original canonical slug');
SELECT public.assert_true(public.test_link('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"party":"Democrat"}')->>'canonical_slug'='alexandria-original','same reviewed decision retries idempotently');
SELECT public.assert_true((SELECT party='Democrat' AND photo_url='https://example.test/portrait.jpg' AND social_handles->>'twitter'='RepAOC' AND NOT is_candidate AND verification_tier='0' FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000001'),'best portrait, social, role and authority retained with reviewed party fill');
SELECT public.assert_true((SELECT candidate_fec_id='H8NY15148' AND is_candidate AND slug='alexandria-candidate' AND is_active FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000002'),'source row, candidacy, identifier and permanent URL retained');
SELECT public.assert_true((SELECT canonical_id='10000000-0000-4000-8000-000000000001' AND source_profile_id='10000000-0000-4000-8000-000000000002' FROM public.politician_external_identifiers WHERE external_id='H8NY15148'),'registry retains original provider provenance');
SELECT public.assert_true((SELECT politician_id='10000000-0000-4000-8000-000000000002' FROM public.questions WHERE id='20000000-0000-4000-8000-000000000002'),'old question is never reparented');
SELECT public.assert_true((SELECT politician_id='10000000-0000-4000-8000-000000000002' FROM public.question_notification_events WHERE question_id='20000000-0000-4000-8000-000000000002'),'old notification event retains composite binding');
SELECT public.assert_true((SELECT count(*)=20 FROM public.weekly_snapshots) AND (SELECT count(*)=1 FROM public.votes),'overlapping snapshots and votes retained');
SELECT public.expect_error($$SELECT public.test_link('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003')$$,'23514','identity roots cannot become chains');
SELECT public.expect_error($$SELECT public.test_link('10000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000003')$$,'42501','test profiles never linked');
SELECT public.expect_error($$SELECT public.claim_politician_profile('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')$$,'42501','existing claim RPC cannot claim a stale source ID');
SELECT public.expect_error($$INSERT INTO public.politician_verifications(politician_id,user_id) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001')$$,'42501','new verification cannot bind to stale source');
INSERT INTO public.questions(id,politician_id,net_upvotes,submitted_by) VALUES('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002',0,'00000000-0000-4000-8000-000000000001');
SELECT public.assert_true((SELECT politician_id='10000000-0000-4000-8000-000000000001' FROM public.questions WHERE id='20000000-0000-4000-8000-000000000003') AND (SELECT politician_id='10000000-0000-4000-8000-000000000001' FROM public.question_notification_events WHERE question_id='20000000-0000-4000-8000-000000000003'),'new source-ID question and event bind canonical atomically');
SELECT public.assert_true((public.ingest_politician_identity('fec.candidate','H8NY15148','{"full_name":"Alexandria Ocasio-Cortez","state":"NY","office":"U.S. Representative","party":"Other","is_candidate":true}',NULL,true)->>'status')='matched','linked provider ID matches canonical without overwriting party or role');
SELECT public.assert_true((public.ingest_politician_identity('fec.candidate','H0NY99999','{"full_name":"Alexandria Ocasio-Cortez","state":"NY","office":"U.S. Representative"}',NULL,true)->>'status')='review_required','new cycle ID with matching normalized name is held for review');
SELECT public.assert_true((public.ingest_politician_identity('congress.bioguide','Z999999','{"full_name":"Completely New Person","state":"Puerto Rico","office":"Representative"}',NULL,false)->>'status')='would_create','preview distinguishes would-create and accepts territory');
SELECT public.assert_true(NOT EXISTS(SELECT 1 FROM public.politicians WHERE bioguide_id='Z999999'),'preview performs no write');
SELECT public.assert_true((public.ingest_politician_identity('congress.bioguide','Z999999','{"full_name":"Completely New Person","state":"PR","office":"Representative","photo_url":"https://example.test/unreviewed.jpg"}',NULL,true)->>'status')='created','new authoritative provider identity creates once');
SELECT public.assert_true((SELECT photo_url IS NULL FROM public.politicians WHERE bioguide_id='Z999999'),'unreviewed imported photo stays observation-only');
SELECT public.assert_true((public.ingest_politician_identity('congress.bioguide','Z999999','{"full_name":"Completely New Person","state":"PR","office":"Representative"}',NULL,true)->>'status')='matched','repeat provider ingestion matches one profile');
SELECT public.expect_error($$SELECT public.ingest_politician_identity('congress.bioguide','Z999999','{"full_name":"Forged","state":"NY","verification_tier":"3"}',NULL,true)$$,'22023','SQL allowlist rejects runtime authority fields');
SELECT public.assert_true((public.ingest_politician_identity('reviewed.governor','new-governor','{"full_name":"Unseen Governor","state":"NY","office":"Governor"}',NULL,true)->>'status')='review_required','unmapped static governor cannot create automatically');
RESET ROLE;
UPDATE public.politicians SET bioguide_id=CASE WHEN id='10000000-0000-4000-8000-000000000003' THEN 'A000003' ELSE 'A000004' END WHERE id IN('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004');
SET ROLE service_role;
SELECT public.expect_error($$SELECT public.test_link('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004')$$,'23514','conflicting stable IDs block linking');
SELECT public.claim_politician_profile('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005');
SELECT public.expect_error($$SELECT public.test_link('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006')$$,'42501','claimed groups require a separate authority migration');
RESET ROLE;
-- A mismatched legacy answer must never raise the displayed participation rate.
INSERT INTO public.answers(question_id,politician_id,body,answer_type) VALUES('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Wrong original owner','direct');
INSERT INTO public.answers(question_id,politician_id,body,answer_type,is_ai_generated) VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','AI is not an official response','ai_analysis',true);
SET ROLE anon;
SELECT public.assert_true((SELECT count(*)=1 FROM public.search_politicians('AOC',8)),'donor acronym search yields exactly one canonical profile');
SELECT public.assert_true(NOT EXISTS(SELECT 1 FROM public.search_politicians('Distinct Fixture 20',50) WHERE id='10000000-0000-4000-8000-000000000020'),'public search excludes test profiles in SQL');
SELECT public.assert_true(public.identity_profile_summary('10000000-0000-4000-8000-000000000002','week',202648)->>'total_questions'='3' AND public.identity_profile_summary('10000000-0000-4000-8000-000000000002','week',202648)->>'qualifying_questions'='2' AND public.identity_profile_summary('10000000-0000-4000-8000-000000000002','week',202648)->>'answered_qualifying'='0','summary counts original questions and ignores AI/mismatched answers');
SELECT public.assert_true(jsonb_array_length(public.identity_profile_summary('10000000-0000-4000-8000-000000000001','all',202648)->'history')=8 AND public.identity_profile_summary('10000000-0000-4000-8000-000000000001','all',202648)->'history'->0->>'qualifying_questions'='2','history groups eight distinct overlapping weeks without rewriting source snapshots');
RESET ROLE;
-- Existing verified answer corrections still obey original owner membership.
UPDATE public.politicians SET verification_tier='2' WHERE id='10000000-0000-4000-8000-000000000005';
INSERT INTO public.questions(id,politician_id) VALUES('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005');
INSERT INTO public.answers(id,question_id,politician_id,body,answer_type) VALUES('40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','Permanent original official wording','direct');
SET ROLE service_role;
SELECT public.assert_true(public.publish_answer_correction('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000005','Correction remains bound to original owner')->>'correction_id'='50000000-0000-4000-8000-000000000005','pending correction migration remains compatible');
SELECT public.assert_true(public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','daily','UTC','politician-question-notices-v1')->>'mode'='daily','pending consent migration remains compatible without sending');
RESET ROLE;
SELECT public.assert_true((SELECT body='Permanent original official wording' FROM public.answers WHERE id='40000000-0000-4000-8000-000000000005'),'correction preserves original response');

\ir ../migrations/20261123032045_atomic_x_publication.sql
SELECT public.assert_true(public.identity_name_key('José García')=public.identity_name_key('Jose Garcia'),'SQL name discovery matches accents without approving identities');

SET ROLE anon;
SELECT public.assert_true('20000000-0000-4000-8000-000000000002'::uuid=ANY(public.identity_profile_question_ids('10000000-0000-4000-8000-000000000001','week',202648,NULL,'unanswered',50)),'unanswered list ignores a different source owner answer');
SELECT public.assert_true(public.identity_directory_counts(ARRAY['10000000-0000-4000-8000-000000000001'::uuid],202648)->0->>'questions'='3' AND public.identity_directory_counts(ARRAY['10000000-0000-4000-8000-000000000001'::uuid],202648)->0->>'replies'='0','directory counts preserve original answer ownership');
SELECT public.assert_true(public.identity_profile_summary('10000000-0000-4000-8000-000000000001','week',202640)->'history'->0->>'week_number'='202647','archive history remains latest eight weeks for historical selected week');
RESET ROLE;
SET ROLE service_role;
SELECT public.expect_error($$INSERT INTO public.questions(politician_id,submitted_by) VALUES('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001')$$,'P0001','new canonical question quota counts original alias history');
RESET ROLE;

-- An already-collected source uses one canonical question, while X attribution stays original.
SET ROLE service_role;
UPDATE public.x_posts SET status='approved' WHERE tweet_id='synthetic-tweet';
SELECT public.assert_true(public.publish_x_post((SELECT id FROM public.x_posts WHERE tweet_id='synthetic-tweet'),'An approved source question with original attribution',202648)->>'published'='true','integrated publisher creates canonical question');
SELECT public.assert_true(public.publish_x_post((SELECT id FROM public.x_posts WHERE tweet_id='synthetic-tweet'),'Retry must not replace the question wording',202648)->>'published'='false','integrated publisher replay preserves one question');
SELECT public.assert_true((SELECT x.politician_id='10000000-0000-4000-8000-000000000002' AND q.politician_id='10000000-0000-4000-8000-000000000001' AND q.body='An approved source question with original attribution' FROM public.x_posts x JOIN public.questions q ON q.id=x.whytho_question_id WHERE x.tweet_id='synthetic-tweet'),'published question resolves canonical while post and wording stay original');
SELECT public.assert_true(NOT EXISTS(SELECT 1 FROM public.question_notification_events e JOIN public.questions q ON q.id=e.question_id WHERE q.source='x'),'X publication cannot manufacture user notification events');
RESET ROLE;

SET ROLE service_role;
SELECT public.ingest_politician_identity('fec.candidate','H0XX12345','{"full_name":"Fresh Federal Candidate","state":"NY","office":"U.S. Representative","is_candidate":true,"candidate_status":"C"}',NULL,true);
SELECT public.assert_true((SELECT politician_type='candidate' AND is_candidate AND candidate_status IS NULL FROM public.politicians WHERE candidate_fec_id='H0XX12345'),'new FEC candidate has candidate type without misreading raw status code');
SELECT public.assert_true((SELECT record->>'candidate_status'='C' FROM public.politician_identity_observations WHERE external_id='H0XX12345'),'raw FEC status remains source evidence');
RESET ROLE;

SET ROLE service_role;
SELECT public.assert_true(public.ingest_politician_identity('congress.bioguide','Z999997','{"full_name":"New Official With Portrait Evidence","state":"NY","office":"U.S. Representative","photo_url":"https://example.test/official-portrait.jpg","photo_source_url":"https://example.test/official-source"}',NULL,true)->>'photo_status'='review_required','new official portrait is explicitly queued for rights review');
SELECT public.assert_true((SELECT photo_url IS NULL AND photo_source_url IS NULL FROM public.politicians WHERE bioguide_id='Z999997') AND (SELECT review_required_fields=ARRAY['photo'] AND record->>'photo_url'='https://example.test/official-portrait.jpg' FROM public.politician_identity_observations WHERE external_id='Z999997'),'new portrait review retains source evidence without publishing unreviewed image');
SELECT public.assert_true(public.ingest_politician_identity('congress.bioguide','O000172','{"full_name":"Alexandria Ocasio-Cortez","state":"NY","office":"U.S. Representative","photo_url":"https://example.test/different-image.jpg"}',NULL,true)->>'photo_status'='preserved','import explicitly preserves existing portrait');
SELECT public.assert_true((SELECT photo_url='https://example.test/portrait.jpg' FROM public.politicians WHERE bioguide_id='O000172'),'existing portrait remains unchanged after new photo observation');
RESET ROLE;
