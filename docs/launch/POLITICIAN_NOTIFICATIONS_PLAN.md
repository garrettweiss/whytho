# Politician question notifications: implementation and activation plan

Prepared October 30, 2026. Owners: WT for database/worker, Jack for channel operations, Garrett for activation approval. Status: complete design, side-effect-free planner and tested legacy-send guards. A production outbox, consent UI, worker and provider webhooks have **not** been deployed or activated. No politician or other third party was contacted.

## User-facing behavior

A question “tags” an official only when it is saved with that official's canonical `politician_id`. Free-text names or X handles do not authorize contact. Every committed, eligible human question appears in the politician dashboard. A verified team member who explicitly opted in can receive a prompt notice or daily summary. Unclaimed profiles remain publicly usable; the system records an internal onboarding opportunity and sends no unsolicited automatic message.

Do not promise a politician will respond. “Published,” “queued for notification,” “provider accepted,” “delivered,” and “official response published” are different states. The public may see “Official answer recorded on [date]”; detailed delivery telemetry and contact addresses stay private. A delivered email does not prove the official saw it.

| Event / recipient | Result |
|---|---|
| New active question from a real site session | Candidate for private inbox event |
| Suggested/seeded or imported X question | No immediate human-question notification; may appear in a separately labeled, opted-in digest |
| Hidden, archived, spam, test profile or deleted/unavailable content | Suppress pending notification; retain an audit reason |
| Verified active member + verified email + explicit current consent | Eligible for chosen delivery frequency |
| Pending/unverified claimant, removed member, wrong profile or unverified email | No message |
| Bounced, complained, unsubscribed or opted-out address | Suppress, including retries already queued |
| Unclaimed politician / no eligible recipient | Internal review item, no guessed emails, no contact-form or X blast |
| Office replies before delayed send | Skip the obsolete new-question alert |

Anonymous users can ask legitimate questions if the product allows them and all abuse checks pass. The email must say “a new question,” not claim verified constituency or voter identity.

## Current implementation findings and changes

- `app/api/questions/route.ts` creates the question but has no transactional notification outbox. A call after insert or `fire-and-forget` promise would lose events on process termination.
- `app/api/admin/politician-weekly-inbox/route.ts` reads unbounded team rows, does not enforce per-profile opt-in, lacks durable delivery idempotency, and counts answer rows without excluding drafts. It is now **held with authenticated HTTP 503 and sent=0** pending replacement. An admin secret alone no longer initiates these emails.
- Existing `notify_answer` and `notify_digest` preferences do not express permission to receive politician new-question alerts. Do not reuse them as inferred consent.
- `scripts/jack-herald.ts` and `scripts/jack-diplomat.ts` formerly defaulted to sending standalone mentions. They are now preview-only, reject `--send`, `--live` and `--apply`, and block the provider call itself. Their historical send logic remains for audit, not execution.
- `lib/email/resend.ts` now defaults links to `https://whytho.us`; the environment must still be checked before activation. Existing operator-name inconsistency remains for legal resolution, not automatic replacement.
- `lib/notifications/planner.ts` implements eligibility, stable event/recipient keys, batching lower bounds and safe provider-retry decisions. It is not wired to a database or provider. `planner.test.ts` exercises ten scenario groups offline.

## Data contract

Use append-only events plus mutable delivery state. Enable RLS on every new table, revoke browser writes to delivery/consent evidence, and expose only a member's own preferences through authenticated, validated routes.

| Proposed table | Critical fields and constraints |
|---|---|
| `politician_notification_preferences` | `(politician_id,user_id)` unique; mode `off/daily/prompt`, verified contact reference, IANA timezone, consent version/text hash/timestamp/source, revoked timestamp; default off |
| `question_notification_events` | UUID, unique `question-created:<question_id>`, question and politician IDs, created_at, schema_version; do not duplicate question bodies unnecessarily |
| `notification_deliveries` | Unique `(event_id,recipient_user_id,channel,template_version)`; state `queued/leased/accepted/delivered/suppressed/retry/reconcile/dead_letter`; next_attempt_at, lease token/expiry, attempts, provider_message_id, first_attempt_at, last_error_class |
| `notification_batches` | Unique recipient/profile/day-window/template; immutable ordered event list and rendered payload hash frozen before first provider call; provider idempotency key |
| `notification_suppressions` | Channel + normalized verified contact hash, scope, reason, source event, effective_at; restrict access; preserve minimal suppression needed to honor opt-out |
| `notification_provider_events` | Provider event ID unique, message ID, event type/time, validated payload metadata; avoid retaining full bodies |
| `notification_approval_runs` | Exact recipient cohort/scope, template hash/version, sender identity, channel, approved_by, approval reference, expiry, kill-switch version; record Garrett's explicit activation authorization |

RLS must prevent an editor from changing another member's contact or reactivating someone who opted out. A self-claimed actor may not subscribe staff to messages. Team admins can nominate a contact; that recipient confirms their own opt-in. Retain the accepted consent wording and timestamp, not only a checkbox boolean.

## Atomic event and worker flow

1. In the same database transaction that publishes an eligible human question, insert the unique event with `ON CONFLICT DO NOTHING`. Prefer a narrowly scoped after-insert/status-transition trigger or extend the existing question RPC. Trigger enqueues only; it never calls an email API.
2. A reconciliation task scans eligible question IDs missing events in ordered pages of at most 1,000, using a high-watermark plus overlap and unique event keys. It fills missed events without creating duplicates. Exclude tests and preserve original creation time; do not blast historical backlog at activation.
3. Every minute, a server-only worker claims at most 50 due rows with `FOR UPDATE SKIP LOCKED`, sets a short lease and commits. Use a dedicated authenticated scheduler secret with replay-resistant invocation or protected service identity; no public endpoint accepts recipient addresses or arbitrary text.
4. Resolve recipients from current team membership, profile verification, verified contacts, explicit preferences and global suppression. Re-evaluate immediately before sending. Lock/check the membership version and recipient contact version; suppression/revocation wins over a previously queued event.
5. Debounce new questions for 15 minutes. Chosen default is daily at 9:00 a.m. recipient local time, after opt-in. Optional prompt mode sends the first batch after debounce, then consolidates additional activity. Cap all new-question email at one message per recipient per rolling 24 hours across profiles. Present all selected profiles in one digest where practical. No repetitive “still unanswered” campaign in v1.
6. The pure planner returns `earliestAt`, a lower bound. A separate timezone scheduler chooses the next allowed window at or after that bound. Recipient local quiet hours: 8 p.m. to 8 a.m.; prompt notices outside that window move to the next 8 a.m. Daily mode moves to the next 9 a.m. window. Use stored IANA zones and DST-aware conversion. Never add 24 hours to a UTC timestamp and call it the next local 9 a.m.
7. Freeze recipients, event IDs, template version and rendered bytes for the batch. Send with the same provider idempotency key on any retry. Update provider acceptance transactionally with the provider ID. Record “accepted,” not “delivered,” from the send API response.
8. Verify provider webhook signatures against the raw request body. Deduplicate event IDs and tolerate out-of-order events. Update delivery state only monotonically; a later bounce or complaint suppresses future sends even after earlier delivery. User opt-out supersedes all queued/retry states.
9. Mark terminal events only after all eligible recipients reach accepted/delivered/suppressed/reconciled state. A retryable database or preference-read error is not “zero recipients” and cannot discard the event.

Concurrency details: the uniqueness constraints provide cross-worker deduplication; leases provide recovery, not exactly-once provider effects by themselves. A worker crash after sending but before saving the provider ID is an ambiguous outcome. Retry the identical payload with the identical key only inside the provider's retention window; after 23 hours stop automatic retries and reconcile provider events/logs. Resend currently retains idempotency keys for 24 hours, so it cannot alone provide indefinite deduplication. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)

Provider webhook authenticity requires raw payload validation; a webhook body is not trusted merely because it says it came from Resend. Validate the signature/timestamp and store the provider event ID before applying effects. [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)

## Failure and abuse handling

| Condition | Behavior |
|---|---|
| Rate limit / transient provider 5xx | Retry same frozen payload/key after 1, 5, 30, 120 minutes with jitter, honor Retry-After; stop after six attempts or before 23-hour boundary |
| Provider accepted but DB update failed / timeout ambiguity | Same-key retry within retention; reconcile outside retention; never mint a fresh key to “try again” |
| Permanent 4xx / invalid sender / missing secret | Dead letter and alert; no retry storm |
| Hard bounce or complaint | Immediate global suppression for that address; no channel fallback |
| Unsubscribe / role removal / profile unverified | Suppress pending messages and recheck active leases before provider call |
| Delivery callback absent | Accepted remains accepted/unknown; no assumption of delivery and no resend solely for missing callback |
| One politician receives a question flood | Daily aggregate plus per-account question limits and moderation; attacker cannot multiply emails by creating questions |
| Imported/seeded questions overwhelm totals | Separate provenance and metrics; never claim these are constituent submissions |
| Scheduler misses a day | Resume with current eligibility and one consolidated digest; stale questions older than seven days become digest-only after review |
| Recipient says “stop” to the monitored reply inbox | Human/operator suppression immediately; preserve minimal reason record; never require sign-in to stop mail |

No unsubscribe token can grant login or change unrelated settings. Use high-entropy single-purpose tokens stored hashed, with narrow scope and rotation. GET opens a confirmation page to avoid mail scanner side effects; standards-compliant one-click POST suppresses without authentication. Do not expose contact values in URLs. Keep open/click tracking off; distinguish delivery from reading.

## Approved-template candidates

These are drafts for Garrett's review. Sender address, reply inbox and business identity/address must be verified before activation.

**N1, opted-in question notice**

- Recipient: the verified opted-in staff account for [profile], resolved at send time.
- Subject: “New question on [profile]'s WhyTho page”
- Body: “A new question is available on [profile]'s WhyTho page. Sign in to review it and draft or publish a response: https://whytho.us/dashboard. You are receiving this because you chose [frequency] question updates for this profile. Change preferences: [signed preference URL]. Stop these emails: [unsubscribe URL]. WhyTho is independent of the office.”
- Avoid personal question text in the email preview by default. Do not include user email, residence, account ID or political affiliation.

**N2, opted-in daily digest**

- Subject: “[N] new questions for your WhyTho team”
- Body: “Your selected profiles received [N] new eligible questions since [last successful batch time]. [Profile]: [count] questions awaiting an official answer. Open your inbox: https://whytho.us/dashboard. This count excludes suggested questions, imported X posts, hidden questions and questions already answered. [Preferences and unsubscribe links].”
- Count distinct questions, not answer rows. The renderer uses current validated data and escapes all values.

**N3, unclaimed office onboarding, manual only**

- Recipient: one publicly published office contact, independently verified from the office website and entered in the review packet.
- Subject: “Invitation to review [name]'s independent WhyTho profile”
- Body: “Hello [office/team], WhyTho is an independent platform where people can ask public officials questions. There is a profile for [name] at [profile URL]. Your team can review it and, after identity verification, publish answers or correct profile information. If this would be useful, the claim process starts at https://whytho.us/verify. Please let us know if this is not the right contact or if you do not want further messages. [Accurate sender and required business details].”
- Draft plus exact recipient must be approved individually. A publicly listed email is not an opt-in, and personal campaign addresses must not be guessed. No automatic follow-up if ignored.

**X channel:** remain disabled for launch. Only design a later opt-in workflow after confirming X's additional approval requirements for brand auto-response campaigns, recipient interaction scope and any AI reply bot. One user's tag of a politician does not authorize an automated mention to either person. [X automation rules](https://help.x.com/en/rules-and-policies/x-automation)

The FTC says message purpose determines commercial versus transactional treatment; a public office address or free product is not an automatic exemption. Counsel must classify these actual templates. Use truthful sender/subject, the required business details and accessible opt-out where applicable; implement immediate suppression as the product standard. [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)

## Test and release checklist

**Already run locally:** 10 offline test groups in `lib/notifications/planner.test.ts`: legitimate event/debounce, seeded/imported exclusion, hidden/archived/answered suppression, membership/verification boundary, consent/suppression, batching floor, delivered-event deduplication, malformed clocks/IDs, provider retention recovery, legacy send guard. These prove policy logic only, not production delivery or end-to-end email receipt.

**Required implementation tests before activation:**

| Scenario | Expected evidence |
|---|---|
| Transaction abort after question insert | Neither question nor event committed |
| Concurrent event enqueue and duplicate worker invocation | One event, one frozen batch and one provider effect |
| Worker crash at each boundary, including after provider acceptance | Stable key, recovery or reconcile, no duplicate email |
| 25 simultaneous questions / two profiles / one staff user | One eligible recipient digest per rolling 24 hours |
| Staff removed, verification revoked, email changed, unsubscribe racing send | Current authorization/contact version checked; suppressed wherever send has not already been accepted |
| Bounce/complaint and replayed/out-of-order webhook | Verified event exactly once, suppression retained |
| Missing preference table or failed membership query | Fail closed and retry, no broad recipient fallback |
| Date change and DST transition in New York, Los Angeles, Phoenix | Next allowed local window correctly selected |
| Weekly reset around DST | `America/New_York` midnight handled as 04:00 or 05:00 UTC as appropriate; no constant-05:00 assumption |
| Wrong profile ID, attacker-supplied address/body, unauthenticated worker call | Denied without disclosure or provider request |
| HTML/header injection and malicious source links | Escaped plain content, fixed canonical origin, no email header injection |
| Legacy weekly route and scripts | Route returns authenticated 503/sent=0; scripts default preview; provider boundary throws |
| Preview/staging deployment | Provider is stubbed, recipients use a local sink, production credentials absent |
| Real delivery smoke, after explicit recipient/draft approval | One approved internal recipient receives one email; links, unsubscribe and provider callback verified |

No synthetic persona test may email a real office. Test-only personas remain isolated and no production question is created for notification testing.

## Rollout, configuration and monitoring

Proposed staged sequence: (1) implement and test schema/RLS/transactional events; (2) deploy worker in shadow mode; (3) observe one full week of intended recipient counts with no sends; (4) review exact templates, sender domain, consent records and recipient cohort with Garrett; (5) approved internal delivery test; (6) five explicitly opted-in teams, 25 recipients maximum; (7) expand only after seven quiet days with no duplicate deliveries or consent violations. Revert to shadow mode on incident; preserve queue/audit records.

Required configuration: `POLITICIAN_NOTIFICATIONS_MODE=off|shadow|live` default off, verified canonical `NEXT_PUBLIC_SITE_URL=https://whytho.us`, authenticated worker scheduler, `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL`, monitored Reply-To, `RESEND_WEBHOOK_SECRET`, separate unsubscribe signing secret, pinned template version, current approval run, global kill switch and batch/recipient caps. These are proposed names; do not infer that setting them activates unimplemented code. Never put secrets or recipient lists in public env variables.

Operator dashboard: oldest queued event, event-to-acceptance latency, suppression reason counts, dead letters, reconciliation backlog, provider bounces/complaints and distinct recipient sends in the last 24 hours. Alert Garrett on any duplicate or consent violation, queue age >30 minutes for a due prompt batch, worker unavailable for 10 minutes, or any unexplained failure. Warnings must not disclose raw user content. For a pilot with tiny volumes, review every bounce/complaint rather than relying on unstable percentages.

Rollback is a mode change to off/shadow and suspended scheduling, not deleting outbox records or resending everything. Before restoring live mode, reconcile every ambiguous provider attempt and confirm current consent. This procedure requires no automatic messaging to any person outside the approved cohort.

## Definition of completion

This plan and its local safeguards are complete when the artifacts and tests are present. Operational notification delivery is complete only after the transaction, worker, consent UI, unsubscribe, provider hooks, observed shadow run and approved live smoke have evidence. Until then the product must not advertise automatic politician notification as active.
