-- Catalog-only check of emergency rollback. Legacy exposure is expected here.
DO $test$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='answers' AND policyname='answers_public_read' AND qual='true') THEN RAISE EXCEPTION 'Legacy answers policy was not restored'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid='public.update_question_net_upvotes()'::regprocedure AND NOT prosecdef AND proconfig IS NULL) THEN RAISE EXCEPTION 'Legacy invoker trigger properties were not restored'; END IF;
 IF NOT has_function_privilege('authenticated','public.update_question_net_upvotes()','EXECUTE') THEN RAISE EXCEPTION 'Legacy function grants were not restored'; END IF;
 IF NOT has_table_privilege('authenticated','public.questions','INSERT,UPDATE') THEN RAISE EXCEPTION 'Legacy question grants were not restored'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='answer-media' AND public=false) THEN RAISE EXCEPTION 'Rollback must retain private bucket'; END IF;
 IF NOT has_table_privilege('authenticated','public.politician_verifications','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Legacy verification grants were not restored'; END IF;
 IF has_function_privilege('authenticated','public.attach_answer_media(uuid,uuid,uuid,text,text,text,text,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'Rollback must retain service-only media RPC'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname='answers_require_verified_identity' AND tgenabled='O') THEN RAISE EXCEPTION 'Rollback must retain identity guard'; END IF;
 RAISE NOTICE 'PASS: rollback restores legacy policy/function/grants and retains private bucket';
END;
$test$;
