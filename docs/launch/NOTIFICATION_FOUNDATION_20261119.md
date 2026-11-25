# Durable question-notification foundation

Prepared November 19, 2026. Owner: WT. Task: T09. Status: local implementation and isolated database tests passed; not applied to production.

## Plain-language result

When a legitimate user publishes a question, the database can now record a private notification event in the same transaction. Either the question and event both save, or neither saves. Repeated publication attempts cannot create duplicate events. This records work for a future notification system; it does not send an email or subscribe anybody.

## Candidate implementation

- `supabase/migrations/20261119000100_question_notification_events.sql` adds an RLS-enabled, private publication ledger, with a unique event per question and an exact question/politician foreign-key binding.
- The event contains identifiers, original question time, event-recording time and schema version. It does not copy the question body, user email, notification address or identity evidence.
- An `AFTER INSERT OR UPDATE OF status` trigger records eligible initial publication or transition to active. It requires `source=user`, not seeded, no X source reference, a submitted user with confirmed email and a nonanonymous account, plus an active nontest politician profile.
- Existing questions are not automatically backfilled. Repeated removal/republication retains the same event instead of generating new alerts. Ordinary active-question edits do not enqueue again.
- Browser roles cannot read or write the ledger. Service role can read it but cannot forge, update, delete or truncate entries. The trigger function is owned by postgres with a fixed catalog search path and no direct browser/service execution grant. Effective grants are explicitly narrowed despite Supabase default grants.
- The ledger's question/politician binding prevents silently moving an already-recorded question to a different politician. Such a correction needs a separately reviewed archival/routing procedure.
- An event remains historical evidence if a question is later restricted. A future worker must re-read visibility, profile/test status, office membership, verification, answer state, recipient consent and suppressions immediately before any send. The event itself is not eligibility or sending approval.

## Verification performed

Ran `sh scripts/test-notification-events.sh` in a fresh socket-only local PostgreSQL 17 cluster with minimal synthetic schema reflecting the actual question enum (`active`, `removed`, `merged`) and publication fields. The cluster and all test evidence were retained. The test creates no remote connection and invokes no provider.

Passing cases:

1. Existing historical question does not create backlog on installation.
2. Eligible user publication creates the canonical event atomically.
3. Seeded, X-imported, anonymous, unconfirmed, unattributed, inactive-profile, test-profile and nonpublic questions do not enqueue.
4. Nonpublic-to-active publication records once; repeated transitions deduplicate.
5. Rolled-back question publication leaves no event.
6. RLS and effective browser/service grants match the private append-only contract.
7. An actual authenticated-role read and service-role insert/update are denied.
8. An event cannot be rebound to another politician by changing its question's profile.
9. Repeat migration application preserves existing events and narrowed access.
10. Four simultaneous duplicate question inserts yield exactly one event.

Final retained evidence: `/tmp/whytho-notification-db.6lD5EL/results.log`; concurrency check passed in the runner output. Initial sandbox execution could not allocate local PostgreSQL shared memory; the authorized normal-access local retry passed. No existing files or databases were deleted.

## Remaining acceptance and implementation

- This is not a full production schema migration rehearsal. Rehearse against a current staging schema, verify constraints/default grants and capture deployment evidence before applying. Review composite-index lock/duration on the intended database.
- Do not mark the full notification feature complete. Consent/preferences, unsubscribe/suppression, delivery state and leases, timezone batching, worker, webhook verification, retries/reconciliation and kill switch remain T10/T11/T12 work.
- Current question API authentication behavior and the latest verified-account product requirement must be reconciled by its owner. This ledger deliberately fails closed for anonymous/unconfirmed users. It does not fix posting permission elsewhere.
- Legacy send paths remain disabled. No historic backfill, scheduled job, recipient import, send, subscription or production deployment occurred.
- Activation still requires one-week shadow evidence and Garrett's exact recipient/template/sender approval under D10, with at most five opted-in teams / 25 recipients and immediate opt-out. A delivered email never proves the office read a question.

Source design: `POLITICIAN_NOTIFICATIONS_PLAN.md`. Latest product/authority decisions: `DECISIONS_2026-11-02.md`, November 19 addenda. Earlier visible-suggestion-label and anonymous-participation language is superseded by those decisions; no suggestion UI changed here.
