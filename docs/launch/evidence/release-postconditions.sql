-- Read-only acceptance checks after all three launch migrations.
-- Expected: no missing/unsafe rows; true for each permission assertion.
SELECT c.relname AS public_table_missing_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;

WITH expected(signature,definer,path) AS (VALUES
 ('public.claim_politician_profile(uuid,uuid)',true,'search_path=pg_catalog'),
 ('public.manage_politician_team(uuid,uuid,text,uuid,text,text)',true,'search_path=pg_catalog'),
 ('public.save_politician_answer(uuid,text,uuid,uuid,text,jsonb,text)',true,'search_path=pg_catalog'),
 ('public.consume_security_rate_limit(text,integer,integer)',false,'search_path=pg_catalog'),
 ('public.enforce_question_submission_limit()',true,'search_path=pg_catalog'),
 ('public.update_politician_verification_tier()',true,'search_path=pg_catalog'),
 ('public.update_verified_profile(uuid,uuid,jsonb)',true,'search_path=""'),
 ('public.replace_verified_portrait(uuid,uuid,text,text,text)',true,'search_path=""')
)
SELECT e.signature, p.oid IS NOT NULL AS exists,
 p.prosecdef=e.definer AS expected_security_mode,
 pg_get_userbyid(p.proowner)='postgres' AS trusted_owner,
 p.proconfig=ARRAY[e.path] AS fixed_search_path,
 NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_denied,
 NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_denied,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_allowed
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);

WITH expected(name) AS (VALUES
 ('public.politician_account_audit'),('public.politician_photo_history'),
 ('public.politician_verification_sources'),('public.security_rate_limits')
)
SELECT name,c.oid IS NOT NULL AS exists,c.relrowsecurity AS rls_enabled,
 NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS anon_denied,
 NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS authenticated_denied,
 has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT') AS service_can_read_append
FROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass(e.name);

WITH ledgers(name) AS (VALUES('public.politician_account_audit'),('public.politician_photo_history'))
SELECT name,NOT has_table_privilege('service_role',to_regclass(name),'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS service_cannot_rewrite_ledger
FROM ledgers;

SELECT role,
 NOT has_table_privilege(role,'public.user_profiles','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS no_profile_table_writes,
 NOT has_any_column_privilege(role,'public.user_profiles','INSERT,UPDATE') AS no_profile_column_writes,
 NOT has_schema_privilege(role,'public','CREATE') AS no_schema_create
FROM (VALUES('anon'),('authenticated')) roles(role);

SELECT count(*) FILTER(WHERE qual LIKE '%user_profiles.is_admin%')=0 AS no_editable_admin_authority,
 count(*) FILTER(WHERE qual LIKE '%app_metadata%' AND with_check LIKE '%app_metadata%')=5 AS five_trusted_admin_policies
FROM pg_policies WHERE schemaname='public'
AND tablename IN ('jack_config','jack_reports','x_posts','x_credit_log','x_outreach_log');

WITH expected(table_name,column_name) AS (VALUES
 ('answers','published_at'),('politicians','photo_credit'),('politicians','photo_rights_basis')
)
SELECT e.table_name,e.column_name,c.column_name IS NOT NULL AS exists,c.udt_name
FROM expected e LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name;

SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND t.tgname IN ('questions_enforce_submission_limit','trg_verification_tier','answers_require_verified_identity');

-- Intentionally zero until separately reviewed authority anchors are loaded.
SELECT count(*) AS reviewed_source_rows FROM public.politician_verification_sources;
