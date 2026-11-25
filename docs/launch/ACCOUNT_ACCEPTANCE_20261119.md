# Politician account acceptance checkpoint

## November 22 update: account, correction and consent migrations integrated

**Twenty-eight connected local checks passed**, with no browser exceptions: all sixteen prior SSR/account-role checks regressed successfully, plus twelve new correction and office-notification preference checks. The fresh synthetic fixture applies the actual notification-event, notification-preference and answer-correction migrations in chronological order after the actual account-transition migration and security-rate-limit SQL. Each migration's hash is retained in the schema provenance.

New verified behavior through actual Next routes, real Auth sessions, PostgREST and PostgreSQL:

- Published-answer PATCH is rejected by the integrated preservation trigger. A separate correction POST records a dated correction, leaves the original wording intact and is idempotent on repeat request.
- Anonymous data-API reads can read the dated public correction; a responder cannot publish a correction.
- A verified fixture office member opts into the daily digest with current consent wording; the response explicitly says sending is disabled.
- Actual settings GET returns that user's preference with private/no-store caching. Stale consent wording and an unrelated account's subscription are denied.
- Opt-out records a revocation timestamp and keeps sending disabled. Anonymous direct data-API access to private preferences is denied.

Evidence: `diagnostics/account-acceptance-20261122/integrated-corrections-consent/` contains `results.json` (28 passed), `ssr-browser-results.json` (five SSR checks plus 23 role/correction/consent results), safe cookie diagnostics, source hashes and the ordered migration provenance. Scratch: `/var/folders/qw/srjfzt4n78g60p0f69pbqyp40000gn/T/whytho-real-auth.meZdKB`. No test listeners remained after completion.

This establishes these combined migrations and routes work together in the minimal isolated schema with real provider/data boundaries. It does not establish full production-schema compatibility, rendered public correction presentation, email delivery or worker behavior, consent suppression during actual sending, or real-office identity verification. The event migration was applied successfully; event-trigger scenario coverage remains the separate notification test suite. No sending worker/provider key was configured, no outbound email was sent, and no production change or successful deletion operation was performed.

## November 22 update: connected real account-role flow passed

The isolated runtime now connects **real browser sessions, actual WhyTho Next routes, native Supabase Auth, native PostgREST and PostgreSQL account functions**. Sixteen checks passed: the five SSR sign-in checks above plus eleven role/data checks:

1. A real confirmed session claims the fictional office through the actual claim route and database RPC.
2. Repeating that claim resumes idempotently.
3. The self-claimed/unverified admin can save only a private database draft.
4. The admin adds real locally authenticated editor and responder identities through the actual team route.
5. The responder creates a real draft but is denied self-approval.
6. The editor approves the saved draft; a direct SQL assertion confirms its published state.
7. The verified-fixture editor publishes a direct response through the full local API/data chain.
8. An unrelated real Auth identity is denied office publication.
9. An editor is denied elevating an outsider to team admin.
10. Last-admin disconnect is refused before membership deletion; SQL confirms one admin remains.
11. The denied outsider publication leaves no answer row.

Evidence: `diagnostics/account-acceptance-20261122/real-role-flow/` contains results, actual source hashes, schema provenance, safe cookie diagnostics and provider artifact provenance. `results.json` records sixteen passed; `ssr-browser-results.json` records five expected/five passed SSR checks plus eleven passing role results and no browser exceptions. All test listeners were confirmed stopped afterward.

The added native PostgREST **14.4** artifact SHA-256 matches the official release digest `cd425a228700856c092f7cd5d84345b0e2517e5426dedb8c1d8dacb6805974e3`. The test uses actual `20261031205615_account_transitions.sql` and the actual security-rate-limit SQL excerpt. `scripts/local-account-data.mjs` supplies a minimal synthetic application schema, not a dump of production. A fixture-only SQL step assigns tier 2 to exercise publication; this does **not** validate a politician's identity or office proof. Synthetic users are created through real local email sign-in. The Next fixture uses the actual claim, team, disconnect, answer-create and approval routes and server client without replacing their Auth/database calls.

No Resend API key is supplied, so optional application notification attempts stop before external delivery. Auth mail goes exclusively to the loopback SMTP capture. Successful member removal is not executed; the last-admin refusal cannot delete a row. No production credentials, data, paid services, third-party emails, cleanup or public activity were used. Test databases and files remain retained. Reusable command: `node scripts/test-local-auth-provider.mjs /path/to/verified/auth --browser --roles /path/to/isolated/runtime`.

This closes the previously missing **connected isolated local core role/API/database** evidence gap for these scenarios. Remaining acceptance is broader: production-equivalent deployment configuration, actual office-source verification and consenting-office proof, controlled external mailbox delivery, expired link/session, Google OAuth/anonymous upgrade, actual media Storage journeys, office transitions/correction history, complete Congress coverage and mobile/accessibility acceptance. A local success is not authority to enable or deploy those behaviors.

Provider reference: [official PostgREST 14.4 release](https://github.com/PostgREST/postgrest/releases/tag/v14.4), checked November 22.

## November 22 update: actual browser and Next SSR sign-in passed

Five additional checks passed in real headless Chrome and an actual isolated Next 15.5.28 application using the **unmodified WhyTho sign-in form, browser client, SSR client and callback route**. Exact copies were hashed in the evidence. Supabase SSR 0.9.0 and supabase-js 2.99.1 match the repository lockfile. Auth v2.198.0, PostgreSQL and SMTP capture were real local services with synthetic data; no Auth/session/cookie response was mocked.

1. The actual form called OTP sign-in, received local captured mail and stored a browser PKCE verifier cookie.
2. Following that real email link reached the actual callback, exchanged the authorization code, persisted session cookies in its redirect, and preserved the safe destination query/hash.
3. A subsequent server-rendered request used those cookies to resolve the same confirmed identity through real `auth.getUser()`.
4. A fixture sign-out endpoint used the actual SSR client to sign out; the next server-rendered request was unauthenticated.
5. The actual callback without a code returned safely to sign-in with `auth_callback_failed`.

Evidence: `diagnostics/account-acceptance-20261122/ssr-browser/ssr-browser-results.json`, `ssr-session-diagnostic.json`, and inspected `ssr-session.png`. Results report five expected/five passed and no browser exceptions. Diagnostics record cookie names, sizes and presence flags only, never cookie/token values. Scratch: `/var/folders/qw/srjfzt4n78g60p0f69pbqyp40000gn/T/whytho-real-auth.UsMg5N`.

Reusable harness: `scripts/test-local-auth-provider.mjs /path/to/verified/auth --browser /path/to/isolated/node-runtime`, supported by `scripts/local-auth-browser.mjs`. The minimal Next fixture wraps real source files with a sign-in page, a server identity proof page and a sign-out endpoint. It is not the whole deployed application. All browser requests outside `localhost`/`127.0.0.1` were blocked. Services were stopped and fixture/evidence files retained.

Early retries exposed fixture routing/hostname issues: native Auth's default verification path differed from the SDK proxy prefix, and mixing `127.0.0.1` with Next's development `localhost` origin split the cookie flow. A consistent localhost app origin fixed the fixture; no application code was changed to obtain a pass. The success assertion requires authentication on the initial callback destination, not a reload workaround.

This closes the **isolated actual application form/callback/SSR-cookie wiring** gap listed below. It does not close full application-database role acceptance, production-equivalent mail/provider configuration, Google OAuth/anonymous-account upgrades, expired-link/session tests, real office verification or all-Congress coverage. Those remain explicit follow-ups. The previously verified eight provider checks, 46 route tests and nine component-browser groups remain distinct layers and should not be added together as a count of completed end-to-end user journeys.

Guidance: [Supabase SSR client documentation](https://supabase.com/docs/guides/auth/server-side/creating-a-client), checked November 22.

## November 22 update: real local Auth and magic-link PKCE passed

The Docker image store still fails with input/output errors, including a write failure when attempting only the small Auth image. An official native macOS arm64 Supabase Auth **v2.198.0** release provided a Docker-free route. Its 25,595,430-byte archive SHA-256 matches GitHub's published digest: `c28c3d67476cf1a76b0bff40fe8b839cbb8a68cc81d7b135a18c1081de3c6ba8`.

`scripts/test-local-auth-provider.mjs` started that real Auth binary, a fresh synthetic host PostgreSQL cluster and a minimal SMTP capture listener, all on loopback. **Eight provider checks passed:** unauthenticated identity lookup denied; OTP issuance captured locally and magic-link PKCE exchange established a confirmed session; access token resolved the correct user; consumed authorization code denied; consumed email link denied; wrong PKCE verifier denied; refresh preserved identity; sign-out prevented subsequent session refresh. Only `example.test` addresses were used. No message left the local SMTP capture and no production key/data was loaded.

The first setup attempts required the Auth schema and its database role search path to be initialized in the fresh synthetic cluster. Those fixture setup corrections were made; no production configuration or application code changed. Auth and PostgreSQL stopped normally afterward; synthetic data and evidence were retained without cleanup. Raw logs can contain synthetic tokens and remain restricted in the scratch directory, not copied into shared evidence.

Safe evidence: `diagnostics/account-acceptance-20261122/local-auth-results.json` and `local-auth-run-summary.json`. Scratch: `/var/folders/qw/srjfzt4n78g60p0f69pbqyp40000gn/T/whytho-real-auth.Jvv1jb`. This supersedes the earlier conclusion that a real local Auth runtime was unavailable. It does not establish deployed WhyTho acceptance.

### Precise remaining application wiring

The application's `components/auth/sign-in-form.tsx` calls `signInWithOtp` with `/auth/callback?next=...`. `app/auth/callback/route.ts` calls the SSR client's `exchangeCodeForSession`, and `lib/supabase/server.ts` reads/writes Next cookies using `@supabase/ssr`. The provider test used explicit PKCE API requests rather than these browser/SSR cookie adapters. Next acceptance must:

1. Run the actual Next application in an isolated environment pointed only at the local Auth/database endpoints, using synthetic keys and identities, with external mail and OAuth disabled. Supply the `/auth/v1` routing expected by the SDK and the minimal application database APIs needed for the flow. No production environment-file reuse.
2. Submit the real sign-in form; verify browser-created PKCE verifier cookies survive the email-link return, the actual callback exchanges the code, and its redirect response persists the authenticated cookies. Test safe `next` redirects, missing/wrong verifier, expired/reused link and callback errors.
3. On a subsequent request, verify actual `auth.getUser()` and middleware/server pages recognize the correct identity; sign-out must remove the application's session and prevent dashboard access/refresh. Add true expired-session behavior separately; expiry was not simulated in the eight provider checks.
4. Bind those real sessions to synthetic admin/editor/responder/pending/outsider memberships and run drafts/publication/team/media operations against a real isolated application database. Existing 46 route tests and nine component-browser groups mock these boundaries and do not close this step.
5. Separately test production-equivalent email delivery only to Garrett's approved controlled aliases, and real office proof only with an identified consenting representative. There is still no verified remote staging branch or consenting office participant. Local SMTP success does not establish delivery to WhyTho's business inbox.

Sources checked November 22: [official release](https://github.com/supabase/auth/releases/tag/v2.198.0), [official Auth configuration and endpoints](https://supabase.github.io/auth/). No provider upgrade, production write, paid resource, third-party contact or deletion was performed.

## November 21 update: local Auth/mail-capture feasibility

Read-only Supabase Management inspection by the coordinator found only the existing WhyTho production project and no branches. There is no verified remote staging branch to use for provider acceptance.

This agent checked the local runtime as a possible no-cost alternative. Docker's daemon responds, but image inventory and inspection of the previously downloaded Supabase PostgreSQL 17.12 image fail with a containerd image-blob input/output error. No containers are currently running. The matching Supabase Auth/GoTrue 2.198.0 image is not installed. No container, image, volume or file was removed, pruned, reset or repaired.

The coordinator also reports only approximately 1.7 GiB of free disk space. Installing a complete local Supabase stack or downloading/building large replacement images is therefore deferred. A standalone non-Docker approach would need the real Auth/GoTrue server plus SMTP capture and a fresh synthetic PostgreSQL database. PostgreSQL binaries exist, but GoTrue, a Go toolchain and Mailpit are not installed. An SMTP capture server alone would not validate real Supabase Auth. No lightweight existing Auth runtime was found, and no replacement fake provider was presented as provider acceptance.

Concrete next step: recover enough local disk capacity and restore a usable Docker runtime, or explicitly approve an isolated remote test environment with its exact cost/data boundary. Any cleanup that deletes files/images/volumes needs Garrett's specific confirmation. After the runtime is available, create a uniquely named synthetic Auth project and local email capture, test magic-link issuance/redemption/expiry/reuse/session behavior without external mail, then separately test the actual application integration. No local Auth provider workflow passed in this attempt; the earlier 46 route tests and nine component-browser groups remain the verified coverage.

## November 21 update: nine real-browser component journeys passed

The existing `scripts/account-browser-check.mjs` ran the actual account React components in a separate headless Google Chrome profile against a loopback-only server. **Nine scenario groups passed**, with zero browser exceptions:

1. Admin changes roles and adds/removes a synthetic member.
2. Team-list failure shows retry and recovers.
3. Responder edits an old own draft and saves a new private draft without public sharing controls.
4. Verified editor deliberately saves privately and approves a draft.
5. Verified editor publishes and sees sharing controls only after confirmed publication.
6. Pending admin remains in the private draft flow.
7. Last admin is prevented from leaving; editor can disconnect.
8. Photo picker requires permission confirmation and credit before upload.
9. Revoked access and ambiguous publication never show a successful public response.

Evidence: `diagnostics/account-acceptance-20261121/browser/results.json`, `admin-team.png`, and `responder-draft.png`. The screenshots were inspected as functional fixture evidence; the harness has simplified styling and is not a production layout/accessibility acceptance test.

HTTP/auth/router boundaries are synthetic. All non-loopback browser requests are blocked. Membership removal in this run updates in-memory arrays only; no database row, file or account was deleted. No production identity, real mail, OAuth, office proof, Storage object or public question was used. These browser checks supplement the 46 route tests but do not establish full application/provider E2E or all-Congress acceptance.

The harness now supports dependencies from its supplied isolated runtime, forces one React/ReactDOM instance across entry/components, replaces a fixed 50ms sleep with the expected disconnect response, saves a failure screenshot, logs each scenario and closes loopback connections on completion. The first run failed before scenarios due to duplicate React instances in the harness, not an application defect; that evidence remains in temporary artifacts. The corrected run passed without changing application components.

No existing authenticated staging environment or controlled test aliases were established by the bounded configuration inspection. Next provider acceptance still needs an identified isolated Supabase/auth environment, the approved aliases actually configured, and a consenting office representative for genuine office-proof acceptance. The unavailable user-browser connector prevents this agent from inspecting or configuring those authenticated provider sessions; no browser credentials were requested or accessed.

## November 21 update: route suites passed

All **46 tests passed**, with zero failures or skips, across the existing release, verification-security and photo route suites. These execute current workspace route/server-page code with synthetic sessions, database/email/storage boundaries and no live provider operations. Coverage includes claim/resume, signed-out and anonymous denial, profile-bound authorization, draft/publication rules, media privacy, role changes and last-admin refusal, verification source/expiry/rate-limit handling, and verified-admin portrait publication controls. They do not establish real sign-in/email delivery, database transaction behavior, office consent or all-Congress coverage.

Evidence: `diagnostics/account-acceptance-20261121/route-tests.log` and `run-summary.json` (runner hashes included). Fresh minimal test dependencies were installed in `/var/folders/qw/srjfzt4n78g60p0f69pbqyp40000gn/T/whytho-accounts-nov21-rw4tmkc3`; copied runner files resolve current workspace application modules through the workspace working directory. The three runners were not rewritten to obtain a pass. This supersedes the November 19 dependency-blocked route-suite status below. No application fix was required by this run. Full project type checking and real-provider acceptance are still separate.

The old temporary runtime had lost its package manifest since November 19. Its attempted dependency repair pruned incomplete dependency files as an npm side effect; no repository or production data was affected. The fresh runtime and evidence are retained. No further cleanup was performed.

Prepared November 19, 2026. Owner: WT. Tasks: T02/T03/LG03. Status: partial local evidence; real-provider acceptance remains open.

## Completed this session

Eleven targeted tests passed in an isolated local source copy, with no production credentials or network providers used:

- API answer results require an explicit publication state; malformed success cannot masquerade as a published answer (2 tests).
- Authentication preserves safe local destinations and rejects external redirects and normalization tricks (3 tests).
- Existing office members resume their own verification state; unrelated identities/roles/rows are rejected; stored verification tier controls status without exposing secrets (3 tests).
- Verification fetch deadlines include DNS and streaming bodies, reject redirects, and stop late connections (3 tests).

Evidence: `diagnostics/account-acceptance-20261119/targeted-tests.log`. Isolated source/runtime: `/var/folders/qw/srjfzt4n78g60p0f69pbqyp40000gn/T/whytho-account-acceptance-1ju5dcx8`. These are unit/boundary tests, not browser sign-in, mail-delivery or office identity-proof acceptance. Test fixtures use synthetic identities.

## What was inspected but not newly passed

`scripts/release-integration.test.ts` already defines role-specific route/page tests for claim/resume, dashboard/private reads, drafts/publication, attachment authorization, editing, team membership, last-admin refusal, identity binding and private staff-directory reads. `scripts/security-integration.test.ts` covers reviewed-source proof, expiry, exhausted OTPs, rate-limit/mail failures and changed-source invalidation. `scripts/photo-integration.test.ts` covers verified-admin photo controls and rights attestation. Their existence is not a successful execution result from this session.

The root runner failed before executing those suites because `tsx` was unavailable in the incomplete local dependency tree. A fresh lockfile install in the isolated runtime supplied enough dependencies for the eleven tests above but had not supplied the full Next.js runtime when this checkpoint was written. Full route-suite execution and type checking therefore remain open. Parent-owned sort-picker changes are not validated by these eleven tests and are not declared deployment-ready.

The database persona runner was inspected but not rerun here: its membership-removal cases actually delete synthetic rows, while Garrett's rule requires explicit approval for deletions. Existing database/recovery evidence from the maintenance task is separate and should be referenced with its actual layer/build, not relabeled as this session's provider acceptance.

## Remaining product requirements and acceptance gaps

1. **Real sign-in and inbox boundary:** implement the approved controlled WhyTho test aliases to Garrett's inbox and record the actual separate test environment. No alias or provider account was created here. Run sign-in, sign-out, expired session, safe return path, lost-access and multi-role browser journeys there. Do not generate public production test activity.
2. **Official-office proof:** independently review office/profile authority sources, bind a proof to the exact office and current member, and test valid, expired, reused, unrelated and revoked proofs. Existing `reviewedSource` looks up profile-bound website/domain/evidence records; reviewed source coverage and a consenting real-office representative still need evidence. A broad government domain alone is insufficient. Do not infer all-Congress coverage from a small fixture suite.
3. **Permanent authentic answers and corrections:** current account-transition SQL permits updating an answer's `body` in place inside its editing rules. This does not establish the newly approved public original-plus-correction history. Implement version-preserving corrections and test that the original remains public before marking that requirement complete.
4. **Office transitions:** test stable former-officeholder profiles/history and isolation of successor access. Existing role tests alone do not establish former-team revocation at an actual office transition.
5. **Staff attribution:** verify the actual public label reads "Answered by [politician]'s office" for authorized staff responses. Successful publication is not evidence of correct public attribution.
6. **Recovery/disputes:** implement a minimal evidence-backed individual dispute procedure under Garrett, with Quinn only the urgent fallback when unavailable. No staff access or automatic complaint action was enabled here.

## Safe next execution

Finish the isolated dependency installation, run the existing route suites and type check against a fresh source snapshot, then close any reproduced failures with targeted tests. Complete version-preserving corrections as a separate implementation change before provider acceptance. Use the approved controlled identities and fictional profiles for staging. Ask for specific third-party contact only when a consenting office test is ready to run. No production account, public answer, deployment, external message, paid service or deletion occurred in this checkpoint.

## Restricted operational follow-up

A runtime diagnostic unexpectedly exposed a Supabase Management access token in an existing npm tool invocation's log. The token value is not copied into this report. The account owner should rotate the affected token through the normal credential flow and update the connector that uses it. No credential or log was changed here; this is separate from account acceptance.
