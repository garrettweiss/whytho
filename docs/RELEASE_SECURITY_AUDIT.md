# Face Value release security audit

Audit date: October 30, 2026, Pacific time (October 31 UTC). Project: `jjwdxjqsnwieksubkkkf` (WhyTho). WT production inspection was read-only. The release owner subsequently applied the reviewed migration successfully as version `20261031041730` and confirmed all 18 production postapply checks true plus zero drafts visible to an anonymous caller. Repository migration and rollback filenames were content-preservingly renamed to match that history version. Application deployment is tracked separately by the release owner.

## Release artifacts

- Migration: `supabase/migrations/20261031041730_release_rls_hardening.sql`.
- Emergency rollback: `supabase/rollbacks/20261031041730_release_rls_hardening.rollback.sql`.
- Local PostgreSQL 17 fixtures and runner: `supabase/tests/security/`.
- Read-only production verification: `supabase/tests/security/postapply.sql` (18 boolean checks).
- Read-only policy expression snapshot: `supabase/tests/security/policy_fingerprints.sql`.

The migration alters existing policies and replaces the existing vote trigger function without removing policies, rows, files, functions, or buckets. It adds a private storage bucket, a service-only attachment RPC, and an official-publication verification trigger. It does not recalculate existing vote totals, rewrite historical snapshots, or change existing answer bodies.

## Live evidence and policy changes

All 24 public tables already had RLS enabled. RLS being enabled did not make the permissive policies safe. The baseline had zero answer-media metadata rows, zero draft media rows, zero objects in the answer-media bucket, and no answer-media bucket. There were zero published, non-AI `direct`/`team_statement` answers at any verification tier. No existing public attachments or human official answers require migration.

| Boundary | Audited baseline | Release behavior |
| --- | --- | --- |
| `answers_public_read` | `USING (true)`, including unpublished drafts | Published rows remain public. Drafts require current matching team membership: admin/editor, or responder whose user ID matches the draft author. |
| `answers_service_all` | Service role only | Unchanged. There was no direct client answer-write policy to remove. |
| `answer_media_public_read` | `USING (true)` | Matching answer must be visible through answer RLS, and answer/politician IDs must agree. |
| `answer_media_team_insert/delete` | Any matching team member could write metadata directly | Both false. The authenticated application API and service-only RPC own writes. |
| Storage `answer_media_public_read`, `answer_media_auth_insert/delete` | Bucket-wide reads and broad authenticated writes | All false for clients. API uploads use service role; delivery signs only after current answer/team authorization. |
| `votes_own_insert/update/delete` | Only `user_id = auth.uid()` | Ownership plus actual current week and matching active question. UPDATE checks old and new rows. |
| Vote trigger | Invoker function attempted to update another user's question; ordinary voter lacked that permission | Locked-path definer performs atomic tally deltas, rejects identity changes, and rechecks active current-week eligibility under question lock for client writes. |
| Question direct writes | Authenticated users could insert arbitrary scores or edit their own score/cohort | Client INSERT/UPDATE grants revoked. Existing service-role creation/moderation remains. |
| Verification direct writes | Requester could set their own status to completed; completion trigger could then grant tier 2 | Client INSERT/UPDATE grants revoked. Server verification routes retain service access. |
| Verification reads | Requester could read their OTP and metadata directly | Client table SELECT revoked. Authenticated resume can SELECT only `id`, `user_id`, `politician_id`, `method`, `status`, still subject to own-row RLS. |
| Politician direct writes | Only service-role write policy | Unchanged. Client attempts to forge verification tier are denied. |
| Human official publication | Service API could publish for an unverified claimed profile | New INSERT/UPDATE trigger requires tier 2/3 for nondraft, non-AI direct/team responses, including service writes. Private drafts and AI publication remain possible. |

The answer-to-team and media-to-answer policy dependencies do not recurse: `team_own_read` depends only on the caller's UID. No new definer function exposes draft data. The existing vote tally definer has `search_path = pg_catalog`, fully qualified relation references, and no client EXECUTE grant. Service-role historical vote maintenance remains possible; vote identity is immutable for every role.

## Attachment and publication contracts

The new `answer-media` bucket is private, capped at 4 MiB per object, and constrained to the existing image/video/audio MIME allowlist. The 4 MiB application cap leaves room within the deployment platform's request limit. No existing public bucket was converted.

`attach_answer_media(actor UUID, answer UUID, media UUID, path, type, URL, filename, size, MIME)` is callable only by service role. It locks the answer and current actor membership, derives the politician ID from that answer, rechecks role and draft author, validates metadata and the exact controlled URL, and caps attachments at five under the answer lock. Responder uploads cannot attach after concurrent approval. Membership changes serialize with attachment authorization. Published human media additionally requires a locked tier 2/3 profile.

Metadata stores `/api/answer-media/{uuid}`. The compatible delivery route checks current user-scoped RLS and draft authorization before creating a 60-second signed redirect. Raw Storage SELECT is denied even to team members so they cannot mint longer-lived draft tokens directly. A previously issued signed link remains valid for its short lifetime; revocation cannot retract it sooner.

The publication trigger locks the politician row before verifying tier 2/3, serializing concurrent tier changes with the write. It does not rewrite or retract previously published answers if verification is later revoked. New edits or attachments to such public human answers fail until verification is restored.

The current submit/approve/edit service APIs check the acting user's team membership before writing. The trigger cannot infer an approving editor from `published_by`, which remains the draft author's ID. A revocation between that API check and a service write remains an application authorization race unless those writes are moved to an actor-aware locked RPC. This is separate from the fully serialized attachment RPC and tier check, and was explicitly reported to the release owner.

## Preflight and rollout

The migration aborts before changes if any reviewed table has RLS disabled, if the eight audited policy sets differ from known fingerprints, if unexpected independent client column grants exist, if an existing answer-media bucket is public, or if the expected vote trigger is missing or changed. Fingerprints include policy name, command, roles, USING, and WITH CHECK. Accepted variants are the audited baseline, this exact release, and the tested emergency rollback's semantically equivalent explicit vote WITH CHECK. Unexpected policy drift is never silently overwritten.

1. Review the migration and compatible API changes together. Run the local SQL fixture suite and application tests/build.
2. Apply the migration as one transaction through the migration runner immediately before the compatible deployment. The new migration's verification gate can reject unverified publishing from old code; the release intentionally closes that boundary first.
3. Record the actual migration history version returned by the production runner. This release was recorded as `20261031041730`; its repository artifacts now match.
4. Run `postapply.sql`; every row must be true. Run bounded public/anonymous HTTP smoke checks and inspect relevant API/storage errors. Do not create real votes, answers, verifications, or media as smoke-test data.
5. Recheck Supabase advisories after apply. Compare new findings with the baseline below rather than claiming the whole project has no advisories.

## Local verification

Run:

```sh
bash supabase/tests/security/run_local.sh
```

The runner starts a socket-only PostgreSQL 17 cluster in a fresh `/tmp/wt-rls.*` directory. It never accepts a production connection string. Generated test records live in a rolled-back transaction. It stops PostgreSQL and retains all scratch files for inspection.

Final result: **PASS**, 70 behavioral assertions run before and after rollback/reapply; two negative preflight tests; repeat application; rollback assertions; and all 18 postapply checks true on both hardened states. The policy and column-grant drift tests both fail before any migration mutation. Latest run log: `/tmp/whytho-rls-final-aligned.log`. The test output records its retained scratch directory.

Coverage includes anonymous, anonymous-auth-session, unrelated user, admin, editor, responder, other responder, and service roles; draft visibility; raw storage denial; direct verification/OTP bypasses; valid votes/upserts/unvotes; archive/removed/mismatched-question votes; immutable vote identity; direct forged tallies; private and published attachment authorization; wrong authors/nonmembers/AI; size/max-count limits; approval-before-attachment; tier 1 drafts; denied tier 1 publication; tier 2/3 publication; AI publication; and later verification revocation.

The fixtures reproduce the relevant audited schema/policies, not the complete Supabase runtime. They prove SQL permissions and state-transition behavior, not a real OAuth/verification transaction or a production upload. Cross-session lock races were reasoned from PostgreSQL lock semantics; the suite checks state changes before writes but does not simulate every concurrent scheduling interleaving. Separate application integration tests cover the service routes without live writes.

## Emergency rollback

Prefer a fix forward or an application rollback retaining the hardened database. The supplied SQL rollback restores legacy read/vote policies and question/verification grants, and therefore reopens the vulnerabilities this release fixes. It is for explicit release-owner use only, never automatic.

The rollback retains the private bucket, service-only media RPC, and identity-publication trigger so newly uploaded assets and the compatible application are not orphaned. It does not delete or alter content. The original votes UPDATE policy had no explicit WITH CHECK and inherited USING; the rollback spells out the same ownership condition because dropping/recreating that policy is unnecessary. Local tests prove rollback behavior and forward reapplication.

## Advisory and error baseline

Read-only advisors and aggregate logs were inspected before the release. No question bodies, verification secrets, user records, storage paths, or raw request logs were printed.

- Security advisors included four informational RLS-enabled tables with no client policy, 12 mutable function-search-path warnings, a public-schema extension warning, and pre-existing callable-definer/anonymous-access notices. The four default-deny chatbot tables are intentional server-only surfaces. This release narrows concrete public boundaries and secures the vote function; it does not broadly rewrite unrelated functions.
- Performance advisors: 17 unindexed foreign keys, 33 auth/RLS initialization-plan warnings, 24 unused-index notices, 114 multiple-permissive-policy warnings, and one authentication database-connection configuration notice. These are baseline counts, not newly introduced findings.
- Health advisors returned no findings.
- Last-24-hour PostgreSQL error aggregates at audit time: one `42501` and three `42703`. Storage aggregates contained 441 HTTP 200 events and 21 events without an HTTP status; no returned 4xx/5xx bucket appeared in that bounded aggregate. These counts alone do not establish causes or a clean error history.

Official references: [RLS policy evaluation](https://www.postgresql.org/docs/17/sql-createpolicy.html), [function security and search paths](https://www.postgresql.org/docs/17/sql-createfunction.html), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [mutable search-path advisor](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), and [RLS without policies advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
