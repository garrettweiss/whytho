# Production release: October 31, 2026

**Status: deployed and verified. Broad marketing remains gated.** Garrett approved applying the three reviewed migrations and deploying the tested release in this chat. That approval was executed; no further release approval is pending for this version.

| Item | Verified result |
|---|---|
| Public site | https://whytho.us |
| Commit on main | [e33ee8278c0fa0363d955bffbc932512129703d8](https://github.com/garrettweiss/whytho/commit/e33ee8278c0fa0363d955bffbc932512129703d8) |
| Production deployment | [CpA3Bd7jhRZCu5Mtgmykw85fBUNg](https://vercel.com/garrettweiss-projects/whytho/CpA3Bd7jhRZCu5Mtgmykw85fBUNg), Ready |
| Immutable deployment URL | https://whytho-k6gq9hdnh-garrettweiss-projects.vercel.app |
| Production ready | October 31, 2026, 2:02 p.m. Pacific; 21:02:33 UTC |
| Framework/build | Next.js 15.5.28; Vercel build completed in 2 minutes 26 seconds |
| CI | Release branch and main both passed; [main run](https://github.com/garrettweiss/whytho/actions/runs/41241490079) |
| Public HTTP acceptance | **25/25 passed** |
| Production security HTTP acceptance | **10/10 passed** |
| Live database privilege assertions | **84 boolean assertions passed**, plus expected counts of eight functions, four private tables, five trusted admin policies, three columns and three triggers |
| Actual PostgREST function checks | **3/3 passed**: nonexistent actors rejected before writes; new functions visible after schema reload |

## Database release

Applied sequentially to WhyTho project `jjwdxjqsnwieksubkkkf`:

1. `20261031205615_account_transitions`
2. `20261031205619_launch_security`
3. `20261031205623_portrait_permissions`

The Supabase migration tool assigned actual execution timestamps. Local files and SQL fixture references now match those remote versions; no migration-history row was rewritten or deleted. These correspond respectively to the reviewed `20261031060000`, `20261031063000` and `20261031070000` files.

Before release, the live catalog exposed a default-grant mismatch: new tables inherit service-role ALL privileges. The two history tables now revoke those defaults and grant SELECT/INSERT only. Regression fixtures reproduce the live defaults and confirm the correction. Final database suites passed **50 account assertions/concurrent scenarios** and **27 security SQL assertions plus concurrency checks**. The portrait migration also reloads the PostgREST schema cache at commit.

All public tables have RLS. Browser roles cannot write privileged user-profile columns, create public-schema objects, call the eight privileged functions or access the four new private tables. Functions have the expected owner, execution mode and fixed search path. History tables are append-only for the service role. Five Jack admin policies use server-managed claims. Reviewed verification-source storage remains empty intentionally; new automatic verification requires separately reviewed authority anchors.

A pre-change catalog snapshot preserves table/column definitions, constraints, grants, policies, function definitions and triggers at `diagnostics/launch-release-20261031/catalog-before-decoded.json` (SHA-256 `416fb8e8a83ed0693b24248906f864e7160b2e640e0e2b7da254819fe2b65b35`). This is a schema/permissions recovery artifact, not a full row-data or storage backup. The migrations did not delete existing civic rows or image files. Recovery must preserve the tightened privileges and audit history.

## Application acceptance and observability

- Production public routes, real directory data, pagination/filter validation, private-field omission and signed-out page gates passed. Homepage/directory caching remained public and showed Vercel HIT/STALE behavior.
- Security headers are present. Signed-out profile, portrait, team, claim and both verification mutations return 401 for the tested requests. Cross-origin mutation returns 403 before the handler. The new portrait credit route returns only its intended public fields.
- Both GitHub CI runs passed TypeScript, the 137-test application suite and ESLint. Vercel preview and production builds succeeded. The release used production environment configuration rather than promoting preview configuration blindly.
- The deployment-scoped Vercel Runtime Logs view showed zero matching runtime entries, Error 0 and Fatal 0, during the immediate post-release observation. This short window is not a claim of exhaustive or long-term monitoring. Tracing/replay remain off as designed; no new drain or monitoring subscription was enabled.
- Supabase security advisors no longer report the previous mutable-function-search-path or browser-executable-definer findings. Remaining notices include intentionally private RLS tables without browser policies, anonymous-access policy reviews, `pg_trgm` in public and leaked-password protection. Health advisors were clear before rollout and the live health endpoint passed afterward.

## Remaining launch gates

1. **Question verification is still unresolved.** A fresh Chrome tab on the deployed Aaron Aylward profile showed the verification-failure message and disabled Submit button. No new console warning/error was captured in that tab. The prior 110200 observation is historical, not reasserted as the current cause. No CAPTCHA was solved and no public test question was submitted. Confirm production widget/key/hostname configuration and finish real form acceptance.
2. **New politician identity verification needs approved sources and provider acceptance.** The authority table deliberately has zero rows. Existing verified teams retain their scoped permissions; unreviewed new proofs fail closed. Real OAuth/magic-link/OTP and consenting-office scenarios still require designated test participants.
3. **Legal operator/contact, published policies and staffed complaint handling remain open.** The 22-risk register and five drafts are review materials. Deployment does not establish legal clearance.
4. **Legacy portrait quality and rights remain open.** No live portrait replacement or license clearance was performed. The full audit and 11,511-profile review queue remain the work order.
5. **Notification delivery is a completed design, not an activated service.** No production outbox/worker/webhooks or campaigns were enabled. No politician messages, social posts or paid ads were sent.
6. **Database runtime patching needs a separate maintenance operation.** Live PostgreSQL reports 17.6. Current Supabase guidance identifies security fixes in 17.11 and upgrade considerations. This release did not restart or upgrade the managed database. Plan the upgrade with diagnostics, backup verification and extension checks rather than treating application dependency fixes as a database-engine patch. [Supabase PostgreSQL release guidance](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)

## Release authorization handling

Automatic approval review rejected creating a public GitHub pull request because its title/body were treated as external communication not separately authorized. No PR or PR message was created through another mechanism. The already authorized production deployment proceeded through a separately approved, non-forced fast-forward of `main` to the CI-passing commit, triggering the existing Vercel integration. The Vercel CLI was logged out; no new credential or expanded permission was created. The authenticated browser was used only to observe the deployment and logs.

Detailed legal/security reports, screenshots, audit results and database snapshots stayed local. The public repository received application code, tests, migrations and operational scripts. Existing files and records were preserved.

## Evidence

- [Production commit, migration and evidence checksums](evidence/production-release-manifest.json)
- [Production route checks](evidence/release-production-http.json)
- [Production security checks](evidence/release-production-security-http.json)
- [Live database assertions](evidence/release-combined-postconditions.json)
- [Live RPC rejection/schema checks](evidence/release-live-rpc-checks.json)
- [Final account database rerun](evidence/release-final-account-db.log)
- [Final security database rerun](evidence/release-final-security-db.log)
- [GitHub CI log](evidence/release-github-ci.log)
- [Post-release advisors](evidence/release-advisors-after-security.json)
- [Original seven-workstream assessment](LAUNCH_READINESS.md)
