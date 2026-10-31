-- Read-only catalog snapshot. No row content is returned.
SELECT schemaname,tablename,md5(string_agg(policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\n' ORDER BY policyname)) AS policy_fingerprint
FROM pg_catalog.pg_policies
WHERE (schemaname='public' AND tablename IN ('answers','answer_media','votes','questions','politician_verifications')) OR (schemaname='storage' AND tablename='objects')
GROUP BY schemaname,tablename ORDER BY schemaname,tablename;
