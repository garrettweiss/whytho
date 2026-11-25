# Hosted acceptance gap: November 22, 2026

Status: **Current production public-schema restore and all three ordered migration rehearsals passed locally.** No migration, database setting, provider binding or production record was changed during this attempt. No production row data was copied. No claim of hosted acceptance or deployment authorization follows from the existing local tests.

## Hosted environment check

The authenticated WhyTho Vercel dashboard shows a Preview for the earlier October 31 base commit `e33ee8278c0fa0363d955bffbc932512129703d8`. The project lists the Supabase service-role variable under both Production and Preview. The existing linked Supabase project has zero branches and no separate WhyTho staging project was found under current access. A separate database for the Vercel Preview could therefore not be verified. [WhyTho deployments](https://vercel.com/garrettweiss-projects/whytho/deployments)

## November 23: approved hosted staging initialized

The user-created Free project `whytho-staging`, exact ref `cckigbmkfvopnvjryifd`, in WhyTho Staging organization, us-east-1, was healthy on PostgreSQL 17.12. Authorized CLI access worked without Keychain extraction. Fresh catalog inspection found zero public objects and functions. Setup was guarded against concurrent nonempty-schema changes and used only the reviewed schema snapshot above, not live rows.

The reviewed public schema restored successfully, followed by all three unchanged R2 migrations. A first complete transaction rolled back when the managed role rejected changing `supabase_admin` default privileges. The successful retry omitted only those 12 provider-owned default-grant statements, retained explicit application grants and postgres defaults, and installed standard `pg_trgm` in public. Actual managed Auth dependencies were supplied by hosted Supabase. No root project link or production binding changed. Candidate SQL was executed through explicit staging CLI queries; this initialization did not register migration-history versions, so a later general migration push requires a separate reconciliation plan rather than blindly replaying old migrations.

Staging now has 32 public tables and synthetic data only: one fictional office, one question, one original public answer, one private draft and one dated correction. The office is deliberately non-test in directory filtering solely to exercise the protected build fixture; its display name is Synthetic Staging Office. Fixture identifiers and wording are in `diagnostics/staging-acceptance-20261123/fixture.json`. No users were created and no provider emails were sent.

**Six hosted PostgREST checks passed** using a stage-only publishable key held in memory: exact R2 nested projection including media limits returns 200, one public answer with draft excluded, original wording retained, dated correction embedded, aggregate count returns 200, and public preference access denied. No aggregate configuration change was needed. Catalog checks also confirmed anon cannot execute correction RPC while service_role can. Safe setup and response evidence is under `diagnostics/staging-acceptance-20261123/`. No API keys were printed or persisted. No local test services remain running.

Protected Vercel deployment and a browser on that hosted release remain separate from this successful database/API setup. The parent owns hosting and the Next acceptance follow-up.

## Successful recovery and verified scope

The first-party Studio repository provides the dashboard certificate template in [custom-content.json](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json). Its production URL is `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. The CA was retrieved through verified HTTPS, identified as Supabase Root 2021 CA, and used with `verify-full` throughout. CA SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

Native `pg_dump` succeeded using the official CLI dry-run configuration and its documented `--role postgres`. It exported 116,170 schema-only bytes, including 28 public tables, with no production rows. Raw export SHA-256: `a81be1a311800971e46cf09dd2b141357507b104f05230475d1b8de06a89d188`. The raw export remains private and was not added to this repository.

A clean uninterrupted restore passed on local PostgreSQL 17.9, followed by successful application of all three saved migrations in order. No SQL objects or constraints were dropped. The only export adaptation was `CREATE SCHEMA IF NOT EXISTS public` for the schema already present in a fresh database. Dependencies explicitly supplied locally: standard `pg_trgm`, synthetic `auth.users(id,email,is_anonymous)`, claim-reading `auth.uid`, `auth.role`, `auth.jwt` functions, and synthetic managed role names including `supabase_admin`. Ownership was mapped to the local owner using `--no-owner`; ACL and default grants were retained. These are managed-dependency emulations, not a full Supabase platform clone.

Post-migration inspection verified RLS on all three main new tables, the answer-preservation trigger, the correction foreign key, and zero correction records. Effective privileges confirmed that anon/authenticated cannot execute correction or preference RPCs, while service_role can; public correction reads are allowed, while preference and event reads are service-only. Results and exact migration hashes are in `diagnostics/integrated-release-20261122/current-schema-rehearsal/results.json`. All isolated database processes were stopped; data and private logs were retained.

This closes the public-schema migration-shape rehearsal gap. It does not replace hosted PostgREST relationship/cache checks, browser acceptance on the release artifact, actual provider settings or delivery tests. The earlier 28 synthetic connected functional checks were not repeated in this run.

## Actual PostgREST read acceptance against the restored schema

A follow-up run used real PostgREST 14.4 against the retained current-schema rehearsal database, with new synthetic profile/question/published-answer/draft-answer/correction fixtures only. **Nine checks passed**: the current `lib/profile/server.ts` question field projection returned HTTP 200, the answer-to-correction foreign-key relationship embedded correctly, original published wording remained present, and the correction returned its exact date and public content. Production public-schema RLS excluded the draft answer and its correction. The projection omitted private actor attribution. Anonymous preference reads were denied.

The projection was sent with Supabase client's normal selection-whitespace normalization. Timestamp verification compared exact instants, accommodating PostgreSQL session timezone formatting. Initial harness attempts exposed these client-encoding/assertion differences; neither required an application or schema change. Fixtures were seeded directly as the local owner; this run verifies the public read path, not the correction publishing RPC or office verification process. Those workflows have the separate connected fixture evidence described below.

Safe results and synthetic response: `diagnostics/integrated-release-20261122/current-schema-rehearsal/postgrest-results.json` and `synthetic-public-response.json`. A subsequent full Next browser run is recorded below. Both local PostgreSQL and PostgREST processes were stopped without deleting retained data. This resolves the local relationship/schema-cache read concern; hosted deployment cache and environment acceptance remain open.

## Full Next profile browser verification

The prepared release source at `/private/tmp/whytho-release-build.UAS0vg` was run in Next dev mode with explicit loopback-only Supabase settings. A local prefix proxy forwarded `/rest/v1/` requests to real PostgREST without replacing database responses. Standalone PostgREST aggregate support was enabled for the app count projection. Chrome blocked non-loopback requests. The route used `?period=all` because the synthetic question deliberately has week 1.

This test found a real integration error missed by projection-only and mocked API tests: the profile's nested media limit produced `PGRST108`, indicating `answer_media` was not an embedded resource. The query used the same answers relation for both public content and the `official` eligibility embed. The parent fixed `lib/profile/server.ts` to explicitly alias the public embed as `public_answers`, direct its filters/order/limits through that alias, and map it back to public answer data. No database permissions or migrations were changed to mask the error.

After that fix, **six actual browser checks passed** against the restored current-production public schema: profile HTTP 200, question visible, original answer visible, dated correction content visible, draft wording absent, and zero browser page errors. Evidence: `next-browser-results.json`, `next-public-profile.png`, and `next-profile-source.json` in the same diagnostic directory. This is a real Next/PostgREST/database public read verification; it remains a local synthetic deployment and does not prove hosted configuration or external provider delivery. All three local services were stopped and retained data was preserved.

## Initial failures, retained as diagnostic history

The target was a schema-only export of WhyTho's public schema using the existing authorized Supabase CLI session, followed by restoration into a separate local PostgreSQL instance and sequential application of these saved migrations:

1. `20261119000100_question_notification_events.sql`
2. `20261122000100_politician_notification_preferences.sql`
3. `20261122000200_answer_corrections.sql`

The ordinary linked `supabase db dump --schema public` failed with `LegacyDockerRunError`: the local Docker/containerd image store returned an input/output error. Its private output file was zero bytes. No Docker repair, reset or pruning was attempted.

A bounded fallback successfully obtained the CLI's dry-run connection configuration in process memory. Only exact connection-variable literal assignments were parsed; the script was never evaluated. Credentials were not printed or persisted. Native PostgreSQL 17 `pg_dump` was invoked with `--schema-only --schema=public --no-owner`, credentials supplied through its child environment, and `PGSSLMODE=verify-full`.

Native export stopped at TLS certificate verification, before authentication or SQL execution: `SSL error: certificate verify failed`. The system trust store does not supply the required Supabase CA. The private output file remained zero bytes. Its retained scratch directory is `/var/folders/qw/srjfzt4n78g60p0f69pbqyp40000gn/T/whytho-current-schema.xwMEgL`. No restore or migration rehearsal was run against an absent schema.

Two public certificate shortcuts on the Supabase domain returned HTTP 404. Opening the exact WhyTho Database Settings page in the current Chrome profile led to the Supabase sign-in form. Certificate verification stayed enabled.

## Reproduction procedure, now completed locally

The following procedure is retained for repeating the rehearsal against a future fresh schema. It is not an outstanding request to change live settings. The official source URL above supplied the certificate for this successful run.

1. Sign in to [WhyTho Database Settings](https://supabase.com/dashboard/project/jjwdxjqsnwieksubkkkf/database/settings). Open **SSL Configuration > Download certificate** and download the project's CA certificate into a private scratch directory. Supabase documents this location and recommends `verify-full`. [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)
2. Repeat the native schema-only export with that certificate passed as `PGSSLROOTCERT`, retaining `PGSSLMODE=verify-full`. Use the CLI's current connection configuration only in memory. Do not copy production records, write connection credentials, or substitute an unverified server certificate as a trusted CA.
3. Inspect schema definitions privately for embedded sensitive literals. Keep the raw export outside the repository with restrictive permissions. Record a schema checksum and sanitized object/version inventory as evidence.
4. Create a fresh local PostgreSQL instance on a unique loopback port and socket. Restore production public schema with explicit synthetic ownership and the required managed-role/auth-schema/extension dependencies. Do not silently drop failed objects or constraints. Any emulated managed dependency must be disclosed; unresolved restore errors mean a full rehearsal has not passed.
5. Apply the three migrations above in chronological order with stop-on-error behavior. Check RLS, grants, service-only RPC execution, correction immutability and PostgREST relationship visibility. Use synthetic records only. Regress the connected account, correction and notification preference journeys. Retain sanitized outcomes; stop local services afterward without deleting data.

The successful native path avoids the broken Docker store and does not require paid hosted resources. A separate authorized hosted test environment is still needed to validate actual deployment settings, provider redirect allowlists, hosted cookies, mail delivery configuration and office verification operations.

## Existing evidence and its limits

The earlier 28 connected local checks passed against real local Auth, Next SSR routes/cookies, PostgREST and PostgreSQL, using a minimal synthetic public schema. They cover account roles, correction history and notification consent. See `diagnostics/account-acceptance-20261122/integrated-corrections-consent/` and `ACCOUNT_ACCEPTANCE_20261119.md`. The new schema-only rehearsal separately verifies ordered migration application against the current production public-schema shape, subject to the managed-dependency and ownership limits above.

Read-only provider checks earlier on November 22 found no dedicated accessible WhyTho staging project and no Supabase branches. The known local preview/production bindings point to production; they must not be repurposed for synthetic acceptance. An authenticated Vercel CLI context was not found, so remote preview configuration remains unverified. Refresh those observations before a hosted release.
