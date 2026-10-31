-- Read-only production postapply checks. Returns metadata/booleans, never bodies.
WITH policy_hashes AS (
 SELECT schemaname,tablename,md5(string_agg(policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' ORDER BY policyname)) hash
 FROM pg_catalog.pg_policies GROUP BY schemaname,tablename
), expected(schema_name,table_name,hash) AS (VALUES
 ('public','answer_media','d6215a238a756d3cdcd8af580b35a9b1'),
 ('public','answers','32c7ddc50322fedb622e0756fe28d193'),
 ('public','politician_verifications','c4bfca7c200f3e0ef0c3ac1f84686706'),
 ('public','questions','0f96fb80307397dc572682edea035c4d'),
 ('public','votes','bb9196a744c7cd319d1fe4e19f3a9682'),
 ('public','politician_team','255f610fd6aa4b68217599a79459cfdc'),
 ('public','politicians','2380567a8633f15376a1ff726fd379a4'),
 ('storage','objects','61326982f49ecee60346bcc244461e3e')
)
SELECT schema_name||'.'||table_name AS check_name,coalesce(actual.hash=expected.hash,false) AS passed
FROM expected LEFT JOIN policy_hashes actual ON actual.schemaname=expected.schema_name AND actual.tablename=expected.table_name
UNION ALL SELECT 'all_public_tables_rls', NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity)
UNION ALL SELECT 'private_4MiB_media_bucket', EXISTS (SELECT 1 FROM storage.buckets WHERE id='answer-media' AND public=false AND file_size_limit=4194304)
UNION ALL SELECT 'question_direct_writes_revoked',NOT has_table_privilege('anon','public.questions','INSERT,UPDATE') AND NOT has_table_privilege('authenticated','public.questions','INSERT,UPDATE')
UNION ALL SELECT 'verification_direct_writes_revoked',NOT has_table_privilege('anon','public.politician_verifications','INSERT,UPDATE') AND NOT has_table_privilege('authenticated','public.politician_verifications','INSERT,UPDATE')
UNION ALL SELECT 'verification_otp_read_revoked',NOT has_column_privilege('anon','public.politician_verifications','verification_code','SELECT') AND NOT has_column_privilege('authenticated','public.politician_verifications','verification_code','SELECT')
UNION ALL SELECT 'verification_resume_safe_columns',has_column_privilege('authenticated','public.politician_verifications','id','SELECT') AND has_column_privilege('authenticated','public.politician_verifications','status','SELECT') AND NOT has_table_privilege('authenticated','public.politician_verifications','SELECT')
UNION ALL SELECT 'tally_definer_locked_path',EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid='public.update_question_net_upvotes()'::regprocedure AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'])
UNION ALL SELECT 'tally_not_client_callable',NOT has_function_privilege('anon','public.update_question_net_upvotes()','EXECUTE') AND NOT has_function_privilege('authenticated','public.update_question_net_upvotes()','EXECUTE')
UNION ALL SELECT 'media_rpc_service_only',has_function_privilege('service_role','public.attach_answer_media(uuid,uuid,uuid,text,text,text,text,integer,text)','EXECUTE') AND NOT has_function_privilege('anon','public.attach_answer_media(uuid,uuid,uuid,text,text,text,text,integer,text)','EXECUTE') AND NOT has_function_privilege('authenticated','public.attach_answer_media(uuid,uuid,uuid,text,text,text,text,integer,text)','EXECUTE')
UNION ALL SELECT 'official_publication_guard_enabled',EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.answers'::regclass AND tgname='answers_require_verified_identity' AND tgfoid='public.enforce_official_answer_verification()'::regprocedure AND tgenabled='O')
ORDER BY check_name;
