# WhyTho marketing readiness

## November 23 production release

[Answer corrections and office email preferences are live](ANSWER_HISTORY_PRODUCTION_RELEASE_20261123.md). The existing identity repair and question sort options were preserved. Three database migrations and nine live checks passed. Politician notification delivery remains off. Hosted office claims, legal and privacy work, portrait rights, and marketing approval remain open.

## November 22 execution checkpoint

The [release candidate](INTEGRATED_RELEASE_CANDIDATE_20261122.md) identifies the three pending database changes and the application files that go with them. A read-only production check confirmed the three migrations and their tables are absent. The local source overlay and checksums are saved. The candidate still needs hosted rehearsal before production approval.

The [database rehearsal](HOSTED_ACCEPTANCE_GAP_20261122.md) restored the live public schema in a local test database and applied all three migrations. Permission and answer-history checks passed. The export contained zero production records. The existing Vercel Preview still has no verified separate WhyTho database for hosted acceptance.

The local browser test against real PostgREST caught a profile query error and passed after a fix. The [revised release package](INTEGRATED_RELEASE_CANDIDATE_20261122.md) preserves the original answer and renders its dated correction. A [protected preview with a separate test database](ISOLATED_PREVIEW_SETUP.md) is the next hosted step.

The profile question form now offers six editable topic starters. All 148 tests, TypeScript, focused lint, and the full Next.js build against synthetic data passed after that change. The starters are outside the release candidate. The [first four source-backed drafts](QUESTION_SUGGESTIONS_FIRST_REVIEW_20261122.md) are ready for editorial review.

### Integrated release checks

An isolated copy installed the locked dependencies afresh. All 147 suite tests passed, strict TypeScript passed, and ESLint passed on the changed profile, answer and notification files. The Next.js production bundle compiled in compile-only mode. The iCloud checkout's installed dependencies are stale, so the checks used the clean install. The build retains pre-existing Sentry configuration warnings.

The connected local fixture applied account, question notification, office preferences and answer correction migrations in order. All 28 checks passed across the real WhyTho routes, Supabase Auth, PostgREST and synthetic PostgreSQL. A separate Chrome run used the full local app with synthetic public profile data and confirmed all three sort modes, including a newest question beyond the default vote-ranked limit, sort retention across periods, and the original answer with its dated correction.

Evidence is retained in `diagnostics/integrated-release-20261122/` and `diagnostics/account-acceptance-20261122/integrated-corrections-consent/`. Hosted provider acceptance and release deployment are still open. Apply the compatible migrations before releasing code that selects the new correction relationship. Notification sending remains disabled.

| Workstream | Verified progress | Remaining acceptance |
|---|---|---|
| Politician accounts | [Sixteen connected local checks](ACCOUNT_ACCEPTANCE_20261119.md) exercised browser sign-in, claims, team roles, drafts and publication using a synthetic database. The [539-member roster check](CONGRESS_ROSTER_RECONCILIATION_20261122.md) found 532 verified profile matches, including all six non-voting House offices. | Reconcile seven missing IDs, check the six generic House labels, and test hosted mail, genuine office proof with consent, office transitions, media and accessibility. |
| Questions and answer history | All three profile sort modes and dated corrections passed local browser checks. [Dated corrections](ANSWER_CORRECTIONS_20261122.md) also passed local SQL and route checks. Six editable topic starters passed a regression test. | Hosted acceptance for sort and corrections, answered-question clarification and retention workflows, and the source-backed suggestion feed. |
| Notifications | [Event ledger](NOTIFICATION_FOUNDATION_20261119.md), [office opt-in/off](NOTIFICATION_PREFERENCES_20261122.md) and [no-send digest projection](NOTIFICATION_SHADOW_20261122.md) implemented and tested locally. | Durable delivery and unsubscribe links, provider checks, a week of shadow-run evidence and approval of the exact pilot. |
| Photos | [Congress inventory](PHOTO_READINESS.md) matched 532 active profiles by official ID. The 5,799 stored portraits were backed up and verified. The [reconciliation](CONGRESS_ROSTER_RECONCILIATION_20261122.md) identifies four existing candidate profiles and three missing federal profiles. | Apply the approved profile updates, establish per-image permission and quality, and validate placeholder and replacement behavior. |
| Legal and operations | [Privacy notice](legal/PRIVACY_NOTICE_DRAFT.md) and [terms](legal/TERMS_DRAFT.md) revised around the approved operator, contact details, participation age, retention direction and moderation responsibilities. | Confirm vendor and retention facts, implement participation and privacy controls, confirm urgent backup availability, and publish reviewed notices. Attorney review remains deferred. |
| Security | [Database upgrade](DATABASE_MAINTENANCE_APPROVAL.md) and [token rotation](TOKEN_ROTATION_20261121.md) completed and verified. | Hosting, dependency, vendor privacy, abuse and monitoring checks remain open. |
| Marketing | [Organic campaign draft](SOCIAL_MARKETING_PLAN.md) updated to remove the outdated suggestion-label claim. | Final assets, measurement, launch acceptance and approval of the exact first batch and timing. |

Changes described as local require integrated testing and release review before deployment. The October assessment below is retained as historical evidence.

> **October 31 release update:** The approved database and application release is now live at whytho.us. See [production release and acceptance evidence](PRODUCTION_RELEASE.md) for the current status, final migration versions, 50 account database scenarios, and remaining launch gates. The assessment below records the pre-release work; references to undeployed/local-only fixes describe that earlier checkpoint.

Prepared October 30, 2026, America/Los_Angeles. Local release candidate based on `4e7103b`. All changes are in the shared working tree. No production migration, deployment, politician outreach, public social post or deletion was performed by this launch-readiness work.

**Decision: do not start broad promotion yet.** The plans, two legal reviews, two security reviews, identified code fixes and local verification are complete. Production rollout/provider acceptance, operational legal decisions and legacy portrait clearance remain required. This report deliberately distinguishes a completed review and tested implementation from a marketing-ready live site.

## The seven requested workstreams

| Request | Delivered | Completion boundary |
|---|---|---|
| 1. Personalized, legitimate questions for every user | [Question plan](PERSONALIZED_QUESTIONS_PLAN.md), all-persona fallbacks, voluntary local/topic preferences, trusted evidence workflow, neutral templates, editorial gates and pilot metrics. Unsupported AI generation/analysis now fails closed. | Plan complete; new retrieval/personalization pipeline is specified, not deployed. No invented questions or fake user activity were published. |
| 2. Politician account management and persona testing | [Account fixes and persona evidence](ACCOUNT_PERSONA_TESTS.md), atomic authority checks, cross-profile protection, last-admin preservation, role-aware drafting/approval, team retries and audit history. | Local implementation and persona tests complete. Actual OAuth, email verification and deployed session continuity require designated-provider acceptance after rollout. |
| 3. Social plan to acquire question askers | [30-day campaign and 12 draft assets](SOCIAL_MARKETING_PLAN.md), neutral positioning, owned/earned channels, funnel, metrics and launch gates. | Plan/drafts complete. No posts, ads or messages sent. Publication requires approved final assets and audience. |
| 4. Automated politician-tag notifications | [Event, consent, outbox and delivery plan](POLITICIAN_NOTIFICATIONS_PLAN.md), tested eligibility/retry planner, templates and rollout acceptance. Unsafe legacy send entry points held. | Plan and guard code complete. Production outbox, consent UI, worker and webhooks are not built or activated. New-question messaging cannot be advertised as operational. |
| 5. Legal agent team and prioritized remediation | [22-risk register](LEGAL_RISK_REGISTER.md), [independent review](LEGAL_SECOND_REVIEW.md), five linked policy/process drafts with owners, priorities, acceptance and counsel questions. | Assessment and fix plan complete. Policies are drafts; operator identity/contact, legal applicability, staffing and rights decisions remain unresolved. No attorney opinion or zero-risk guarantee is claimed. |
| 6. Security agent team and vulnerability fixes | [Security audit](SECURITY_AUDIT.md), [independent review](SECURITY_SECOND_REVIEW.md), local corrections to admin escalation, verification, account races, SSRF, chat/private data, quotas, telemetry and dependencies. | Identified application fixes and local tests complete. Live vulnerabilities remain until matching database/application changes are released and verified. Development dependencies retain 20 low/moderate findings. |
| 7. Quality portraits, coverage, legal basis and easy replacement | [Full photo audit and remediation queue](PHOTO_READINESS.md), permission/credit upload UI, verified-admin authorization, normalization, history, versioned imports and source/license display. | Replacement controls and complete inventory ready. Quality/rights clearance for most existing portraits is **not complete**. No unsupported license was assigned and no live image was replaced. |

## Executed validation

| Check | Result | Evidence and limits |
|---|---|---|
| Integrated automated application tests | **137/137 passed** | [Final tests](evidence/final-tests.log). Includes actual route modules with mocked providers, AI evidence, photos, security, notification planning and existing civic logic. |
| Account database lifecycle/concurrency | **46 passed** | [SQL output](evidence/account-database-tests.log): 42 assertions and four actual concurrent scenarios. Synthetic PostgreSQL 17, production-like auth-table privileges. |
| Security database checks | **25 SQL assertions plus concurrency checks passed** | [Security SQL](evidence/security-database-tests.log), actual migrations, race/counter tests, RLS and privileges. |
| Chrome component persona interactions | **9 groups passed, zero browser exceptions** | [Results](evidence/account-browser-results.json). Real React components, mocked API/auth/router boundaries, local harness. |
| Production build, TypeScript and full ESLint | **Passed** | [Build](evidence/final-build.log), [types](evidence/final-types.log), [lint](evidence/final-lint.log). Built on local disk outside iCloud with final lockfile. Sentry deprecation/instrumentation suggestions remain nonfatal maintenance work. |
| Local production HTTP smoke | **25/25 passed** | [HTTP results](evidence/launch-http-checks.json). Real public civic data, public routes, cache/privacy boundaries and signed-out gates. No account mutation or question submission. |
| Local security HTTP checks | **4/4 passed** | [Security HTTP results](evidence/launch-security-http-checks.json): response headers, signed-out photo/profile rejection and cross-origin denial. Next normalizes the loopback IP to localhost; the initial alias-origin diagnostic is retained, with independent confirmation of the cause. |
| Production dependency audit | **0 known findings at audit time** | [Runtime audit](evidence/npm-audit-production-after.json), down from 30. [Full audit](evidence/npm-audit-all-after.json) still has 17 moderate and 3 low development-tool findings; no high/critical. |
| Source-secret pattern scan | No matches | [Scan scope/results](evidence/source-secret-scan.json). Current tracked/nonignored source only, not ignored environment files or all Git history. |
| Photo audit | **7,615 distinct URLs checked** | [Final summary](evidence/portrait-quality-v2.json). 1,860 meet 400 x 400, 1,925 smaller portraits, 2,120 too small and 1,710 failed/refused checks. Identity, licensing and visual quality require review. |
| Live question submission readiness | **Blocked** | [Browser observation](evidence/live-verification-observation.json): refreshed live page shows verification failure. Historical tab console has Turnstile 110200. No real public question was submitted as a test. |

CI now calls the supported ESLint command and the expanded test suite. The review also repaired the existing search combobox accessibility relationships and pre-existing script lint failures. Passing local tests does not establish that external provider settings, legal operations or undeployed controls work in production.

## Prioritized release and launch gates

| Priority | Gate | Owner | Exact completion evidence |
|---|---|---|---|
| P0 | Release the security/account controls | WT + Garrett release approval | Review and apply three ordered migrations below, deploy matching app/lockfile, then verify live RLS/privileges and role-denial cases. Existing site users are affected by tighter permissions; absent reviewed source anchors, new automatic verification intentionally fails closed. |
| P0 | Restore real question verification | Cloudflare account operator + WT | Confirm the production widget/sitekey allows the actual live host and correct key pair. Live browser obtains a valid token; one designated test question completes through the real form without bypass. No automatic CAPTCHA solving is authorized. [Cloudflare error guide](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/) |
| P0 | Establish trusted verification authority | Trust operator + WT | Populate reviewed official website/email anchors using [source procedure](VERIFICATION_SOURCE_REVIEW.md); validate a consenting office's positive/negative proof paths and contested-claim procedure. A claimant's edited website is not authority. |
| P0 | Resolve legal operator and public procedures | Garrett + qualified counsel + trust operator | Confirm Zellon LLC versus Quinnivations LLC, monitored public business contacts/address and age policy; finalize and publish privacy/terms and urgent reporting/copyright/correction intake, with a responsible on-call owner. Drafts and an unmonitored email address do not close this gate. |
| P0 for imagery/promotion | Clear legacy portrait display and pilot assets | Image editor + counsel/operator | Exact rights/identity review for marketed profiles; decision on reversible display quarantine for unresolved legacy images; source/license/credit evidence and visual inspection. Existing originals/history remain preserved. |
| P1 before pilot expansion | Complete actual provider and account acceptance | WT + designated test participants | OAuth/magic-link login/logout/expiry, email delivery/OTP, team changes, draft publication, portrait change and mobile/assistive flows using agreed staging identities. No impersonation of real users. |
| P1 before any automated outreach | Implement and approve reliable notification delivery | WT + Jack + Garrett | Deployed consent/outbox/worker/webhook system passes the notification plan's duplicate/retry/opt-out tests; exact sender/template/recipient cohort approved. Current work deliberately sends zero messages. |
| P1 | Run source-backed question and marketing pilot | Editorial + growth | Reviewed evidence for all suggested questions; 20-office/100-question pilot per question plan; only cleared assets; actual question/submission/response funnel measured without fabricated engagement. |
| P2 | Broaden hardening and operations | WT + operator | Resolve compatible development dependency upgrades, CSP/runtime/provider settings, vendor retention, accessibility review and remaining legal register items before expansion. |

Suggested sequencing is security rollout first, then provider/identity and legal-image gates, then a controlled pilot, then broad promotion. Unknown image rights cannot be repaired by source-code changes alone. A draft marketing plan does not authorize contacting politicians or posting publicly.

## Concrete release package

Apply only after release approval and fresh live inspection/backup:

1. Confirm the preceding `20261031041730_release_rls_hardening.sql` is applied.
2. Apply `supabase/migrations/20261031205615_account_transitions.sql`.
3. Apply `supabase/migrations/20261031205619_launch_security.sql`.
4. Apply `supabase/migrations/20261031205623_portrait_permissions.sql`.
5. Deploy the matching application and `package-lock.json`. Protected routes use the new functions and must not go out before the schema.
6. Recheck RLS, service-only function grants/owners, immutable admin authority, security headers, public/private response boundaries, rate limits and exact provider flows. Keep verification without source anchors, unsupported AI and outbound automation closed.

The migrations add transactional operations, audit/history and reviewed-source/rate-limit storage, and tighten privileges. They do not intentionally delete civic rows or image objects. Recovery retains security corrections and audit data; disable an affected feature or deploy compatible application code rather than restoring the unsafe grants. See the security audit for detailed release/recovery steps.

`CLAUDE.md` explicitly requires an instruction in the same message for a production deploy or merge to `main`. That authorization has not been supplied for this release. The reviewed candidate is ready for that decision; it has not been silently shipped. No approval for outreach, destructive cleanup or paid campaigns is inferred from release approval.

## Business facts required to finish the public launch

- Legal operator and monitored public contact/address, plus who will own urgent complaints and account disputes.
- Approved handling of legacy images with unknown rights and per-asset evidence for the pilot.
- Cloudflare operator access/configuration correction and designated staging/provider-test recipients.
- Separate explicit authorization when final marketing assets or politician outreach are ready to send.

These facts are intentionally left explicit. No entity identity, permission grant, legal clearance, delivery result or successful live verification has been invented to make the checklist appear complete.
