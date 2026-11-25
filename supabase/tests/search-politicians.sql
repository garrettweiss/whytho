\ir politician-identities-fixture.sql
\ir ../migrations/20261123031955_politician_identities.sql
-- The fixture omits the baseline trigram indexes that production has (20260401000000_remote_schema_baseline.sql).
CREATE INDEX idx_politicians_full_name_trgm ON public.politicians USING gin (full_name public.gin_trgm_ops);
CREATE INDEX idx_politician_aliases_alias_trgm ON public.politician_aliases USING gin (alias public.gin_trgm_ops);
CREATE FUNCTION public.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
INSERT INTO public.politicians(id,slug,full_name,state,office,district,bioguide_id) VALUES
 ('10000000-0000-4000-8000-000000000001','alexandria-original','Alexandria Ocasio-Cortez','New York','U.S. Representative','14','O000172');
INSERT INTO public.politicians(id,slug,full_name,state,office,district,party,is_candidate,aliases) VALUES
 ('10000000-0000-4000-8000-000000000002','alexandria-candidate','Alexandria Ocasio-Cortez','NY','U.S. Representative','14','Democrat',true,ARRAY['Candidate AOC']);
INSERT INTO public.politician_aliases(politician_id,alias,alias_type) VALUES('10000000-0000-4000-8000-000000000002','AOC','nickname');
INSERT INTO public.politicians(id,slug,full_name,state) SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fixture-'||n,'Distinct Fixture '||n,'NY' FROM generate_series(3,20)n;
UPDATE public.politicians SET is_test=true WHERE id='10000000-0000-4000-8000-000000000020';
SELECT public.link_politician_identity('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  (SELECT updated_at FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000002'),
  (SELECT updated_at FROM public.politicians WHERE id='10000000-0000-4000-8000-000000000001'),
  public.politician_identity_dependency_counts(ARRAY['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid]),
  gen_random_uuid(),'Synthetic reviewer','{"approved_to_apply":true,"source_urls":["https://example.test/identity-proof"]}','{}');
INSERT INTO public.politicians(id,slug,full_name,state,is_active) VALUES('10000000-0000-4000-8000-000000000021','inactive-evans','Gabe Evans','CO',false);
INSERT INTO public.politicians(id,slug,full_name,state,aliases) VALUES('10000000-0000-4000-8000-000000000022','gabe-evans','Gabriel Evans','CO',ARRAY['Rep. Gabe Evans']);

-- Snapshot results from the pre-fix function, then apply the fix and compare.
CREATE TEMP TABLE before_fix AS
 SELECT q, (SELECT array_agg(id ORDER BY ord) FROM public.search_politicians(q,50) WITH ORDINALITY o(id,slug,full_name,office,state,party,photo_url,ord)) ids
 FROM unnest(ARRAY['AOC','Candidate AOC','Alexandria','ocasio','Distinct Fixture 20','Fixture','gabe','Gabe Evans','Rep. Gabe','evans','xyzzy','  aoc  ']) q;
\ir ../migrations/20261125203000_search_politicians_index_prefilter.sql

SET ROLE anon;
SELECT public.assert_true((SELECT count(*)=1 FROM public.search_politicians('AOC',8)),'alias table search yields exactly one canonical profile');
SELECT public.assert_true((SELECT id='10000000-0000-4000-8000-000000000001' FROM public.search_politicians('Candidate AOC',8)),'aliases[] array search resolves to the canonical profile');
SELECT public.assert_true((SELECT full_name='Gabriel Evans' FROM public.search_politicians('Rep. Gabe',1)),'aliases[] array match ranks above weaker full_name matches');
SELECT public.assert_true(NOT EXISTS(SELECT 1 FROM public.search_politicians('Distinct Fixture 20',50) WHERE id='10000000-0000-4000-8000-000000000020'),'public search excludes test profiles');
SELECT public.assert_true(NOT EXISTS(SELECT 1 FROM public.search_politicians('Gabe Evans',50) WHERE id='10000000-0000-4000-8000-000000000021'),'public search excludes inactive profiles');
SELECT public.assert_true((SELECT count(*)=0 FROM public.search_politicians('x',8)),'single character query returns nothing');
SELECT public.assert_true((SELECT count(*)=0 FROM public.search_politicians(repeat('a',101),8)),'over-long query returns nothing');
SELECT public.assert_true((SELECT count(*)=8 FROM public.search_politicians('Distinct Fixture',8)),'result_limit caps results');
RESET ROLE;
-- Owner role: compare against the snapshot taken before the migration ran.
SELECT public.assert_true(
  (SELECT count(*)=0 FROM before_fix b WHERE b.ids IS DISTINCT FROM (SELECT array_agg(id ORDER BY ord) FROM public.search_politicians(b.q,50) WITH ORDINALITY o(id,slug,full_name,office,state,party,photo_url,ord))),
  'index prefilter returns identical results and ordering to the scoring-only implementation');
-- The whole point of the fix: candidate lookup must be able to come from the trigram indexes.
-- The fixture is tiny, so sequential and plain index scans are disabled: GIN indexes are only reachable
-- through bitmap scans, and this proves each trigram index is usable for the <% operator.
SET pg_trgm.word_similarity_threshold=0.3;
SET enable_seqscan=off;
SET enable_indexscan=off;
CREATE TEMP TABLE plan_lines(line text);
DO $$
DECLARE l text;
BEGIN
  FOR l IN EXECUTE $q$EXPLAIN SELECT p.id FROM public.politicians p WHERE 'gabe' OPERATOR(public.<%) p.full_name
    UNION SELECT a.politician_id FROM public.politician_aliases a WHERE 'gabe' OPERATOR(public.<%) a.alias
    UNION SELECT p.id FROM public.politicians p WHERE 'gabe' OPERATOR(public.<%) public.politician_alias_search_text(p.aliases)$q$
  LOOP INSERT INTO plan_lines VALUES (l); END LOOP;
END $$;
SELECT public.assert_true(EXISTS(SELECT 1 FROM plan_lines WHERE line LIKE '%idx_politicians_full_name_trgm%'),'full_name candidates use the trigram index');
SELECT public.assert_true(EXISTS(SELECT 1 FROM plan_lines WHERE line LIKE '%idx_politician_aliases_alias_trgm%'),'alias table candidates use the trigram index');
SELECT public.assert_true(EXISTS(SELECT 1 FROM plan_lines WHERE line LIKE '%idx_politicians_alias_text_trgm%'),'aliases[] candidates use the new expression index');
SELECT public.assert_true(has_function_privilege('anon','public.search_politicians(text,integer)','EXECUTE') AND has_function_privilege('anon','public.politician_alias_search_text(text[])','EXECUTE'),'browser roles keep search access');
