# No-send notification shadow readiness

Prepared November 22, 2026. Partial T11 preparation. No live worker, schedule, provider call or production migration.

## Implemented

- `scripts/notification-shadow-projection.sql` reads persisted T09 event/T10 preference rows in one repeatable-read, read-only transaction. It rechecks canonical question/profile binding, active human-source question status, nontest active verified profile, current membership, confirmed nonanonymous recipient email, current unrevoked consent, unchanged verified contact hash and absence of a published non-AI official answer. It returns identifiers and eligibility, never email addresses or question bodies.
- `lib/notifications/shadow.ts` consolidates events across profiles into a single recipient batch. It deduplicates event/recipient pairs and resolves the next local 9 a.m. after the latest of current time, 15-minute debounce and last accepted send plus 24 elapsed hours. It uses civil dates/IANA timezone conversion rather than adding 24 hours to a UTC daily timestamp. Conflicting timezones across a recipient's office preferences hold the batch for resolution.
- Unknown global suppression or accepted-delivery history holds work instead of treating missing data as an empty history. Global suppression and completed-event evidence also hold work. Invalid clocks, timezones or future delivery history do not produce a batch.
- The result always reports `sendingEnabled: false`. The module has no provider dependency and does not claim, lease, send or mark anything delivered.

## Meaningful tests

`lib/notifications/shadow.test.ts`: scheduling tests passed for spring-forward, fall-back, Nepal's 45-minute offset, rolling24h cap ending after today's9am, multi-office batching, duplicate rows, revoked/ineligible/completed events, missing history, debounce crossing9am, suppression and conflicting zones.

`scripts/test-notification-shadow.mjs <isolated-runtime>` created an actual retained local PostgreSQL fixture, applied the candidate T09 and T10 migrations, saved preferences through the real RPC and generated real publication events through the trigger. Four projection stages passed:

1. One active question is eligible; a subsequently removed question stays held.
2. Persisted self opt-out leaves no batch.
3. Re-opt-in followed by email change leaves no batch until renewed consent binds that contact.
4. A newly published official answer leaves no obsolete new-question batch.

Evidence: `/var/folders/qw/srjfzt4n78g60p0f69pbqyp40000gn/T/whytho-shadow-local.eq3PVq/`. Contains fixture log, initial/opted-out/changed-contact/answered snapshots and result.json. All data is synthetic; the runner starts a socket-only local cluster, stops it afterward and preserves files. Explicit known-empty suppression/delivery history is valid only for this never-sent fixture, not production.

## What this does not complete

This is a reusable local projection and acceptance runner, not the actual delivery worker. Missing pieces remain durable delivery/batch state, leases and recovery, recipient-wide concurrency serialization, provider idempotency, signed webhook processing, bounce/complaint suppression storage, email unsubscribe tokens/links, activation authorization and a completed one-week shadow observation. No send is implied by a candidate batch.

The SQL currently scans the small local fixture completely; it is not yet a paginated production scanner. A production implementation needs bounded ordered reads/keyset pagination, verified full-cohort completeness and explicit unknown/error states. It must refresh eligibility immediately before any provider interaction. The projection snapshot alone cannot close an opt-out/member-removal race with a future send.

An event arriving just before9am may conservatively defer its recipient's entire candidate batch to the following9am to respect debounce. Future batching can split eligible older events if desired; it must preserve the cross-profile rolling24h cap.

No production configuration, paid service, external message or deletion occurred. Full T11/T12 remain open.
