# Database maintenance preparation

## November 21 production upgrade outcome

Garrett initiated the upgrade from the Supabase dashboard. Follow-up read-only checks confirmed build `17.12.0.000`, project status `ACTIVE_HEALTHY`, and HTTP 200 with `ok: true` from WhyTho’s public health endpoint. This verifies the deployed version and baseline recovery. Full sign-in, voting and office-answer workflow checks remain separate acceptance work. The downtime duration was not measured.

## November 21 refresh and decision preparation

### Owner decision: interruption budget accepted

Garrett accepted up to one hour of service interruption and delegated choosing the timing. The preceding question explicitly stated that his answer would not start the update. Record this as acceptance of the interruption budget and scheduling discretion, not execution authorization. Do not ask him to choose a time again. Prepare the exact proposed start after feasible preflight, and obtain the final concrete execution approval required by that earlier commitment.

Fresh read-only preflight at13:58UTC (07:58 America/Bahia_Banderas) onNovember21 reconfirmed ACTIVE_HEALTHY, build17.6.1.084 and eight completed physical backups, latest09:52:53.983UTC. PITR is still disabled. Evidence: `diagnostics/maintenance-20261121/read-only-preflight.json`. The credential was loaded privately from the existing configuration; only GET requests were made and no token was printed.

**Proposed conditional window:** November21,2026,08:30-09:30 America/Bahia_Banderas (14:30-15:30UTC), plus postchecks immediately afterward. This uses a staffed active session; no traffic analysis is claimed. It is a proposal, not a booking or scheduled automation. Use it only if the final approval and immediate preflight are complete before08:15local and an operator remains present through postchecks. Otherwise choose the next staffed window and present its exact timing; do not start late or silently roll approval forward.

**Concrete outstanding prerequisites:**

1. Reconfirm the offered17.12.0.000 target, current one-hour/no-downgrade warning and eligibility immediately before execution. They were last observedNovember19. Current tools provide read-only API access but no live browser control; execution requires the authenticated dashboard or an explicitly authorized equivalent path.
2. Capture fresh operational diagnostics and Storage coverage just before the change, and establish the recovery cutoff. The latest verified physical backup is03:52:53local, about4hours before this check. A restore to it could lose subsequent writes. The November19 portrait backup is verified for its recorded5799files; new/changed files since then must be checked. Do not promise that all current writes are recoverable from the daily backup.
3. Present these exact safeguards and residual recovery limitations for final execution approval, as promised. Full managed in-place upgrade and production physical-backup restore are untested; these are disclosed limits, not claims that the successful synthetic tests covered them.

**Stop and escalation conditions:** Do not start if the target/warnings differ, provider eligibility reports a blocker, health is degraded, backups are unavailable, or the staffed window is missed. During the upgrade monitor provider status and service health. If still offline at one hour, report immediately and inspect status; do not issue a second upgrade, restart, restore, paid change or destructive repair by implication. After service returns verify installed build, health assertions, readable historical answers and profile images, auth/session boundaries, authorization/RLS and scheduled jobs. Keep question-notification sending off. Controlled mutation tests require the designated environment/identities; do not insert public test activity into production as an implicit postcheck.

Using the rotated read-only credential, fresh Management API checks confirm ACTIVE_HEALTHY and installed build17.6.1.084. Eight completed backups are listed, latest2026-11-21T09:52:53.983Z (03:52 America/Bahia_Banderas); PITR remains disabled. The offered17.12.0.000 target and one-hour/no-downgrade warning were last directly observed November19 and must be rechecked immediately before execution.

Current provider upgrading documentation says a failed upgrade brings the original database back online; successful upgrades cannot be treated as freely reversible. Daily-backup restore remains a separate, disruptive recovery action and can lose writes after its cutoff. No production restore is authorized by maintenance approval. Synthetic target tests and the verified5799-file local portrait backup are the demonstrated safeguards, not a full production restore rehearsal.

Next owner decision: accept a potential one-hour service interruption for a staffed maintenance window, then select its exact timing. This is not yet execution authorization. Before execution refresh diagnostics, target/warnings, backup and portrait coverage; preserve current writes in an appropriate recovery artifact or clearly disclose its cutoff; record postchecks and stop/escalation conditions. Do not enable paid PITR, start an upgrade or restore by implication. Full physical recovery/provider-browser rehearsal remains a disclosed limitation.

Prepared November 19, 2026. Owner: WT. Decision: D09. Action: T04.

## Plain-language explanation

The software running the database needs security updates, just as a computer does. Updating it can briefly interrupt sign-in, asking, voting and answering. Prepare a verified backup, test the change and recovery, then ask Garrett to approve a specific maintenance window. Do not ask for approval of an unspecified upgrade.

**Current recommendation: complete recovery preparation before requesting execution approval.** Fresh checks confirm PostgreSQL17.6, completed physical backups and offered target17.12.0.000. A synthetic logical backup restored successfully into that exact target image; this does not establish production-backup restorability or rehearse Supabase's managed in-place upgrade. No production restart, upgrade, billing change, new project or application-data mutation was performed. The authenticated CLI reported initializing its routine login role while querying.

## Evidence and unresolved facts

### Authenticated dashboard check, November 19

Garrett signed into his other Chrome profile (Garrett, getspill.app). Native Chrome UI inspection confirmed WhyTho project jjwdxjqsnwieksubkkkf and owner garrettweiss@gmail.com. General settings show installed build 17.6.1.084 and offered target **17.12.0.000**. Opening the upgrade confirmation displayed: **all services offline for up to 1 hour**, and **no downgrade back to 17.6.1.084**. The confirmation was canceled; no upgrade was started. Screenshot: ../../outputs/whytho-launch-tracker-20261101/database-upgrade-warning-20261119.png. Subsequent compatibility, synthetic recovery and completed public-portrait backup evidence is recorded below. Managed upgrade/physical restore remain untested.

| Item | Evidence | Current acceptance |
|---|---|---|
| Project | Authenticated dashboard and CLI identify WhyTho project `jjwdxjqsnwieksubkkkf` | Confirmed November19 |
| Installed engine | Fresh Management API project listing: engine17/build17.6.1.084, ACTIVE_HEALTHY. Live SQL: PostgreSQL17.6 aarch64, database53,701,779 bytes | Verified November19 |
| Offered target | Authenticated dashboard offers17.12.0.000 | Verified November19 |
| Upgrade duration | Confirmation warns all services offline up to1hour and no downgrade | Verified; actual interruption may differ |
| Backups | Live backup listing reports8 completed physical backups, latest2026-11-19T09:57:32.058Z, plus November12-18; WAL-G enabled; PITR disabled | Backup existence verified; restoration/recovery not rehearsed |
| Existing recovery artifact | October 31 catalog snapshot preserves schema/permissions | Not a complete data or Storage backup |
| Extension compatibility | Live extensions: pg_cron1.6.4, pg_stat_statements1.11, pg_trgm1.6, pgcrypto1.3, plpgsql1.0, supabase_vault0.3.1, uuid-ossp1.1 | Targeted catalog checks below passed; external/dynamic encryption use cannot be excluded from catalogs alone |
| Rehearsal | Synthetic account/concurrency and logical recovery tests passed on local17.9; its synthetic backup restored to exact Supabase17.12.0.000 | Limited logical restore verified; managed in-place upgrade and live provider workflows not rehearsed |
| Operator/window | Garrett is the accountable owner | Exact staffed start time/timezone, interruption budget and recovery authority missing |

The installed CLI initially could not start within the sandbox because its telemetry write under `~/.supabase` was denied. The normal-access read-only retry succeeded, as did backup metadata and version/extension queries. No authentication reset was needed. The cached version was independently corroborated by live SQL.

### Compatibility and recovery tests completed November19

- Read-only catalog checks found no installed `ltree` or `btree_gist`, no operators with non-built-in selectivity estimators, and no PGP or legacy-cipher references in inspected nonextension stored function bodies. Repository SQL also had no such encryption options. This is not proof that an external caller never used a legacy cipher; that remains an explicit limitation.
- PostgreSQL17.12 release notes add index considerations beyond17.11. No `gist_trgm_ops` or unbounded `bpchar` B-tree indexes were found. Catalog inventory contains348 B-tree,5GIN and3hash indexes, with zero invalid indexes. Existing GIN/hash indexes do not by themselves prove corruption; inspect actual symptoms rather than running blanket production reindexing. No reindex was executed.
- There are no logical replication slots and no public tables with RLS disabled. The only detected `reg*` columns are provider-managed `realtime.subscription.entity` (`regclass`) and `claims_role` (`regrole`). Do not edit provider schemas to satisfy a generic checklist; dashboard eligibility/provider behavior must handle those objects.
- The existing local host engine is17.9. The account SQL fixture and four concurrency cases passed there: simultaneous claims yield one administrator, simultaneous disconnects preserve an administrator, simultaneous publications yield one answer, and publication racing membership revocation is denied.
- A synthetic logical backup/restore preserved9users,10politicians,6questions,5answers,9team memberships and21audit rows, with critical privileges unchanged.
- Pulled official `public.ecr.aws/supabase/postgres:17.12.0.000`, image digest `sha256:8630950b489ecc70563300180287a98c192a4a48f5ae00b4febdaeea1abe85de`. Restored the synthetic17.9 dump into a network-isolated instance of this exact target. User/answer/audit counts, browser RPC denial, restricted auth-table access, append-only audit and outsider publication denial all passed. Synthetic files and stopped test containers were retained, not deleted.
- This tests SQL/permission compatibility and logical recovery of synthetic data. It does not exercise Supabase's production physical backup, its17.6-to17.12 managed upgrade, full provider extensions, browser sign-in, real mail delivery or the complete application journey.
- Authenticated Backups UI independently shows eight physical backups datedNovember12-19 and Restore controls. No Restore control was used. Availability of that control does not establish a successful restore. The dashboard explicitly warns Storage objects are excluded.

Evidence: `diagnostics/maintenance-20261119/compatibility.sql`, `compatibility-result.json`, `prerequisites-result.json`, `synthetic-recovery-result.log`, `target-image-manifest.json`, `target-image-pull.log`, `target-runtime.log`, and `target-recovery-result.log`. Raw synthetic clusters and backup remain under `/private/tmp/whytho-maintenance-recovery.LiLAWS`; exact-target test container is `whytho-recovery-1712-20261119`.

### Storage recovery gap and local backup

Live metadata shows5799 public portrait objects totaling71,715,108bytes; `answer-media` is private and has no stored objects in the queried metadata. Of11,513profiles,8011have a photo URL and **zero have `photo_source_url` populated**. Therefore source links cannot be assumed to recover the stored portraits. The metadata does not establish current permission to republish any asset.

The read-only public-portrait backup completed: **5799of5799files,71,715,108bytes, zero failures**, with every downloaded file's length and SHA256 verified. A second copy was retained under gitignored `diagnostics/maintenance-20261119/private-portraits`, and every copied file was independently reread and rehashed. The root directory is owner-only and files are owner-read/write. The temporary original remains preserved. Durable verification completedNovember19 at21:03UTC (15:03 America/Bahia_Banderas). Final live Storage totals still match5799objects and71,715,108bytes. This is per-object byte recovery evidence, not a transactionally consistent point-in-time database snapshot or proof of an upload restore to Supabase.

Summaries: `diagnostics/maintenance-20261119/portrait-backup-summary.json`, `portrait-backup-durable-summary.json` and `storage-final-counts.json`. Full source-key/size/SHA256 manifest is inside the ignored backup directory. No private answer-media files were downloaded and no remote file was changed. This backup does not cover externally hosted photo URLs or replace rights review. Keep the backup private and do not commit it. Refresh coverage immediately before an eventual upgrade if new uploads occurred.

## Required preparation, in order

1. Use an existing authenticated Supabase session to inspect this project's General settings and Database Backups. Record engine/build, offered upgrade target, estimate, warnings, latest successful backup timestamp and available restore route. Do not click the execution control or enable paid services.
2. Capture current diagnostics before any restart or upgrade, following `RUNBOOK.md`: `npx tsx scripts/db-diagnostics.ts`. Use the verified normal-access CLI route; a file full of errors is not successful diagnostics. Keep raw operational evidence restricted and out of public commits.
3. In the authenticated SQL editor, run a read-only transaction to establish version and extension inventory:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT current_setting('server_version') AS server_version,
       version() AS build,
       pg_database_size(current_database()) AS database_bytes;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
COMMIT;
```

4. Inspect existing schema/function definitions and run only applicable read-only detection queries from the official release guidance. Do not execute example reindexing, extension removal, temporary helper creation or encryption changes as part of an inspection. If a compatibility fix is needed, prepare and test it as a separate reviewed change.
5. Verify a usable database backup with schema, roles and row data, its timestamp and recoverable scope. For a small database, prepare a restricted logical backup as recommended by Supabase, using a verified installed CLI/pg_dump route. Keep private data outside the public repository. Do not assume a schema-only export covers accounts, votes or answers. Establish recovery for custom-role credentials separately without exposing secrets.
6. Inventory Storage recovery separately, because database backups include metadata but not the image/file objects. Preserve original files and source URLs. A database upgrade does not itself justify deleting or replacing assets.
7. Rehearse the exact target and a restore in an existing isolated environment with synthetic data where possible. Preserve production role, RLS, extension and function structure; do not copy private production data to a new service by implication. If a new paid test project is necessary, present that cost and action separately. Capture duration, failures, recovery steps and test outcomes.
8. Test sign-in, read pages, question submission, positive/negative votes, vote uniqueness/concurrency, office membership/answer authorization, existing answers and attachments, profile images, cron jobs, RPCs, RLS and notification suppression on the rehearsed target. Use designated controlled identities. Do not generate public test questions or contact real offices.
9. Prepare a staffed low-traffic window based on the dashboard estimate and rehearsal, including post-upgrade validation time. Establish how writes and scheduled workers will be handled during interruption, then present any production configuration changes with the exact execution package.

## Final approval card, fill only from verified evidence

- Current version/build: **PostgreSQL17.6, Supabase17.6.1.084**, verified November19.
- Offered target/build: **17.12.0.000**, verified in authenticated dashboard.
- Compatibility findings and disposition: targeted catalog checks and synthetic target restore passed as scoped above; no catalog evidence of identified extension/index blockers, with external encryption use and full provider behavior unverified.
- Backup timestamp: **completed physical backup2026-11-19T09:57:32.058Z**, with PITR disabled. Scope/restore route and tested recovery remain **unverified**.
- Storage recovery coverage: all5799public portrait objects copied locally and into an ignored durable backup, with lengths and SHA256 verified in both copies; final live totals match. No private answer-media objects existed in the queried metadata. External photo URLs and a Supabase upload-restore procedure are not covered.
- Rehearsal: November19 synthetic logical restore to exact17.12.0.000 passed. No measured managed production-upgrade duration or physical-backup restore rehearsal.
- Start date/time/timezone, interruption budget and staffed operator: **not yet selected**.
- Exact production action: provider-managed upgrade of the confirmed project, plus separately enumerated prerequisite changes only.
- Recovery: **not yet demonstrated**. Do not promise an engine downgrade or instant rollback. Identify the provider-supported restore route, restored-data cutoff, credential/service consequences and stop conditions before approval.
- Postchecks: health assertions, expected civic counts, auth, reads/writes, vote/answer authorization, RPCs, cron, RLS, images and error monitoring.
- Approval state: **preparation authorized; execution not ready for approval**.

If fresh inspection shows an adequately patched engine and no applicable outstanding advisory, document that evidence and close the unnecessary upgrade action instead of scheduling an upgrade merely because an old tracker row exists.

## Provider sources checked November 19, 2026

- [Supabase upgrading guide](https://supabase.com/docs/guides/platform/upgrading): dashboard estimate/warnings, service interruption, backup and application-validation guidance.
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups): Pro daily backups retain seven days; PITR is separate; Storage objects and custom-role passwords have recovery limitations.
- [Supabase PostgreSQL 15.19 / 17.11 changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): historical patch rationale and compatibility detections. This is not asserted to be today's latest project target.
- [PostgreSQL17.12 release notes](https://www.postgresql.org/docs/release/17.12/): additional index fixes and backup considerations reviewed for the offered target. Do not assume provider WAL-G backups use PostgreSQL incremental-backup format merely because incremental-backup cautions exist in upstream notes.
- [Supabase CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore): logical migration/recovery scope and configuration considerations.

Local evidence: `docs/launch/PRODUCTION_RELEASE.md`, `RUNBOOK.md`, `scripts/db-diagnostics.ts`, `diagnostics/launch-release-20261031/catalog-before-decoded.json`, and `supabase/.temp/postgres-version`. Cached values are explicitly not live evidence.
