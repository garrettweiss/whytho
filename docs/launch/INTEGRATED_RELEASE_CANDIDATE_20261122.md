# Integrated release candidate, November 22, 2026

Status: review package only. **Not deployed, not authorized for execution.** WT prepared this candidate for Garrett's review. Local base commit is `e33ee8278c0fa0363d955bffbc932512129703d8`; the candidate is uncommitted working-tree code, so no immutable candidate commit/deployment ID exists yet. Do not deploy the entire dirty working tree by implication.

Use the revised source overlay `diagnostics/integrated-release-20261122/candidate-source-overlay-r2.tar.gz` and `candidate-source-manifest-r2.json` in that directory. The manifest pins the base commit, lockfile, archive and all 30 files by checksum. Revision 2 changes only the public profile query in `lib/profile/server.ts`. The archive excludes the separate question starters and environment settings.

## Plain-language result

This candidate adds three ways to browse questions, preserves an original official answer when its office publishes a dated correction, and lets office members record whether they want daily question emails. It also records eligible new-question events privately. **Question emails remain off:** recording a preference or event does not send a message.

## Exact scope to freeze

| Feature | Runtime files |
|---|---|
| Server-backed Most votes, Newest and Most votes unanswered; preserve sort across periods | `app/[slug]/page.tsx`, `components/politician/period-tabs.tsx`, `components/politician/question-list.tsx`, `lib/profile/server.ts` |
| Public original answer/date, office attribution and dated corrections; draft edits remain separate | `app/api/answers/[id]/route.ts`, `components/dashboard/answer-edit-button.tsx`, `components/dashboard/question-inbox.tsx`, `components/politician/question-list.tsx`, `lib/profile/helpers.ts`, `lib/profile/server.ts`, `lib/profile/types.ts`, `types/database.ts` |
| Authenticated office email preferences, default off, explicit consent and immediate self opt-out | `app/api/settings/office-notifications/route.ts`, `components/dashboard/question-email-preferences.tsx`, `app/dashboard/page.tsx`, `lib/notifications/consent.ts`, `types/database.ts` |
| Private eligible question-publication ledger, preference evidence and immutable-answer/correction enforcement | Three migrations below |

Candidate test/support changes include `lib/profile/profile.test.ts`, `lib/notifications/consent.test.ts`, `scripts/release-integration.test.ts`, account/browser/local-provider harnesses, and the corresponding synthetic SQL suites. Preserve these in the reviewed source snapshot. Notification shadow projection code/scripts are offline preparation, not an activated delivery worker. Private diagnostic files, token-rotation scripts, local backups and legal/security reports are not a public release payload.

**Excluded:** editable question starters currently being implemented independently; new AI generation/personalization activation; delivery workers, sending schedules and notification activation; database-engine upgrade; politician portrait replacement; automatic moderation/retention; real office invitations. Freeze a clean candidate snapshot that excludes those additions. If a shared file such as `app/[slug]/page.tsx` or `question-list.tsx` changes for starters, separate the unvalidated changes or validate a new combined candidate. Do not assume the earlier evidence covers later edits.

## Fresh production preflight, read-only

On November 22, the linked CLI queried only migration version numbers and table existence for WhyTho project `jjwdxjqsnwieksubkkkf`. No credentials appeared in command arguments/output. The CLI emitted its routine login-role initialization notice. No application migration or data write was requested.

Production migration versions returned:

`20260401000000`, `20260819120000`, `20261027120000`, `20261030120000`, `20261030120001`, `20261031041730`, `20261031205615`, `20261031205619`, `20261031205623`.

The three candidate versions below are absent. `to_regclass` returned null for `public.question_notification_events`, `public.politician_notification_preferences` and `public.answer_corrections`. This establishes the candidate tables are not present at that check, not that every production precondition or deployed application version has been verified. Repeat these checks immediately before authorized execution.

## Migration order and checksums

Apply after the existing account-transition/security migrations, in this order:

| Order | Migration | SHA-256 |
|---|---|---|
| 1 | `20261119000100_question_notification_events.sql` | `c8774c1c1be55ab6492b9b6b3aea31151d1b872769492bfaa92e1c117193b29d` |
| 2 | `20261122000100_politician_notification_preferences.sql` | `3a66d59eba95068f3489441edc6dfba92b32700974f31fe43354e55c42377481` |
| 3 | `20261122000200_answer_corrections.sql` | `3aeeb3bad8212270fc55de7fbb3a962a2c4dfd85b88b56daaf0ee53c87d0f4c7` |

The event migration creates an exact question/profile binding and index; it does not backfill historical notifications. Check current index/lock duration before applying to the intended database. The preference migration adds private consent state and membership-revocation handling. The correction migration creates the public history relationship and blocks future silent edits to published wording/sources. Earlier overwritten answer versions cannot be reconstructed by this migration.

**Migration first is required.** The new public profile query selects `answer_corrections`, so deploying that application before migration/cache refresh can fail profile reads. Old application reads can coexist with these additive tables. However, once the preservation trigger exists, old published-answer edit UI can receive a refusal; rollback cannot restore silent-edit behavior. Confirm migration completion and PostgREST relationship visibility before switching the application.

Do not use a blanket database push that could include unrelated files. Freeze these exact reviewed migration files, compare remote history, and use the approved project's migration runner for the explicit list. The correction file uses unconditional object creation: do not blindly rerun it after an ambiguous outcome; reconcile history/catalog first. Never repair migration history or delete objects as an automatic retry.

## Evidence and limits

| Check | Result and evidence |
|---|---|
| Connected actual account/SSR/correction/consent chain | **28 passed**, no browser exceptions. Real local Auth 2.198.0, Next routes/cookies, PostgREST 14.4 and PostgreSQL with minimal synthetic public schema. `diagnostics/account-acceptance-20261122/integrated-corrections-consent/` includes route/source hashes and ordered migration provenance. |
| Integrated repository test selection | **147 passed**, zero failed/skipped. `diagnostics/integrated-release-20261122/integrated-tests.log`. This is the recorded selection, not proof that every possible acceptance scenario was tested. |
| Production compilation | `integrated-build.log` records successful Next 15.5.28 **compile mode**, followed by an explicit instruction to finalize using generate/generate-env. It is not a fully generated release artifact or production smoke. Sentry deprecation/global-error warnings remain visible. |
| Public profile browser check | `integrated-profile-browser-final.log` records three sort modes, newest beyond the vote-limited subset, unanswered official exclusion, period-sort preservation and original plus dated correction. See the coordinator's fixture scope; it is not a production change. |
| Whole application type check and focused lint | Coordinator confirms both passed in isolated CI dependencies on the pre-starter candidate. Repeat affected checks when freezing an updated snapshot; the result is not inferred from compilation. |

Evidence log SHA-256 values at preparation:

- Tests: `d71c8d5c4b02a18aae1ac364d642a62ce34cfa0ce694db34783642159ed56518`.
- Compile-mode build: `6568257f6b1ed06c9238a28733894fd5c679987d810f41e28394d905c0c67677`.
- Profile browser log: `b321037a3d2cb1a4f611ebec95ccfec91dfe3a166f0e9f77204922b31840074b`.

All existing tests remain distinct layers. Synthetic verification tier assignments do not prove office identity, and a local SMTP capture does not establish delivery to an office or WhyTho's business inbox. No production credential/data was copied into those fixtures. Test services were stopped and data retained.

The coordinator subsequently reports 148 passing tests after adding separate starter files. Those starter changes are outside this package; that later count does not silently expand the candidate scope. The pre-starter count of 147 and its recorded log remain the evidence summarized here.

The expanded development snapshot with starters completed a full `next build` against a local synthetic API. A separate run with the saved release runtime scope, excluding the new starters and the six shadow projection tests, passed 141 tests and generated all 113 pages with the corrected synthetic directory and sitemap fixtures. Both build logs and the fixture are in `diagnostics/integrated-release-20261122/`. Source checks matched the overlay and tracked build files. Hosted build and schema acceptance remain open.

The [current-schema rehearsal](HOSTED_ACCEPTANCE_GAP_20261122.md) restored all 28 live public table definitions locally with zero production records and applied these exact three migrations in order. Database permission and answer-preservation checks passed. The rehearsal used local substitutes for managed Auth functions and roles. Nine checks against actual local PostgREST confirmed the public query returns the original answer and its dated correction and excludes drafts and private attribution. Hosted acceptance remains open.

The full browser test uncovered an ambiguous answer relationship in the first release package. Revision 2 gives the public answer list and the answered-question filter distinct aliases. The full Next profile then passed six browser checks against real PostgREST on the restored local schema, including visible original wording and dated correction. The revised sources passed 141 tests, TypeScript and focused ESLint. A full Next build generated all 113 pages using synthetic data. See `profile-alias-tests.log` and `profile-alias-build.log` in the diagnostics directory.

## Required before execution approval

1. Reconstruct the checksummed source overlay on the pinned base in the intended build environment. Verify the lockfile and all overlay file hashes. Record the resulting candidate build or commit ID.
2. Run the deployable production build against the intended hosted data. Verify directory and sitemap generation and record the hosted result.
3. Refresh the production migration collision and schema checks at release time. The local rehearsal against the current production public schema already passed. Verify the hosted correction relationship and permissions in the intended environment.
4. Verify a recent recoverable database backup and separate Storage coverage with timestamps and scope. Existing historical catalog captures and presence of physical backups are not a tested row-data restore. Preserve all civic records and images.
5. Use the [isolated hosted preview setup](ISOLATED_PREVIEW_SETUP.md) to prepare exact staging and production identifiers. Record the operator, start window, expected interruption and prior compatible deployment separately from the database engine update.
6. Present that concrete package to Garrett for migration/deployment execution approval. No notification sender/cohort or marketing publication is authorized by such an application release.

## Authorized-release run sequence, after approval

Capture fresh pre-change evidence and backup state. Apply only the three migrations in order; inspect effective RLS/grants, service-only RPC execution, trigger definitions and migration history. Verify the new correction relationship through PostgREST. Stop on unexpected results instead of deploying against an uncertain schema.

Deploy the frozen application candidate to the explicitly approved environment. Keep question-message sending disabled. Perform the smoke checklist below, then record exact application commit, deployment ID, migration execution versions, timestamps and evidence. A successful tool command is not the acceptance result.

## Smoke and acceptance checklist

- `/api/health` returns its healthy assertions; directory/profile counts remain plausible. Check a known current profile and historical period.
- Default Most votes ranks by net score; Newest includes recent low-vote questions; Most votes unanswered excludes only published official answers. Period switches retain sort. Question/answer routes remain bound to the correct profile.
- Existing official wording and sources remain visible, dated corrections appear beside the original in chronological order, and answer permalinks remain stable. Signed-out users cannot see private drafts or correction actor audit evidence.
- Use controlled identities in isolated staging for valid claim/resume, pending/private draft, responder draft, editor approval, outsider denial and last-admin protection. Do not post public test questions or answers in production merely to smoke test.
- Validate real Auth return/session cookies and sign-out under deployed hostname/HTTPS/provider settings. Local localhost success does not prove those settings.
- Office preference defaults off; daily consent is saved only for the actor's current verified office membership; off records revocation. The UI/API explicitly report sending disabled. No provider delivery, worker or cron is enabled.
- Event ledger permissions remain private, no historical backlog is created, and eligible publication scenarios are demonstrated in staging without outside messages.
- Check public cache behavior with fresh and warmed requests, private/no-store settings responses, mobile/keyboard basics and errors. Preserve the cookieless public data client and data-layer caching; search-parameter pages can themselves be dynamic.

## Recovery without deleting data

If application smoke fails, halt rollout and route traffic back to the recorded prior compatible application deployment where possible. Leave the additive tables, original-answer protection and consent/audit history intact. Do not drop migrations, delete rows, rewrite history or weaken authorization to make old code work.

If the old app's edit-in-place UI conflicts with the new preservation trigger, keep published editing unavailable until a compatible app fix is reviewed; do not remove the trigger. A database/permission defect requires its own reviewed forward fix or specifically approved recovery operation. A blanket engine downgrade or instant database rollback is not promised. Restart, restore and any data removal need their own concrete approval and evidence under existing rules.

## Follow-ups still outside this release's acceptance

Real-office proof and source coverage; all-Congress roster/persona coverage; office transition and broader dispute/withdrawal workflows; full permanent archive across unavailable questions; OAuth/anonymous-account upgrade and expiry; actual media Storage journeys; accessibility/mobile full journeys; notification delivery/batches/retries/webhooks/unsubscribe links/global suppression and one-week shadow observation; exact opted-in recipient/template activation approval; legal/operational coverage and approved public notices; reviewed image permissions; final marketing batch and measurement pilot. This candidate does not close the entire launch plan.
