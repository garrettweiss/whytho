# Office question email preferences

Prepared November 22, 2026. T10 local implementation. Sending remains disabled.

## Result

Office team members can save their own daily-summary preference or turn it off in the dashboard. The default is off. Daily summaries require a confirmed email, current membership of an active verified office, a valid timezone and explicit acceptance of the displayed consent text. The UI states that question emails are not yet sending. These preferences are separate from existing general answer/digest settings; no preexisting preference is treated as consent.

The new API binds every operation to the user returned by the authenticated session, uses bounded JSON, checks request origin on mutations, sanitizes database failures and returns private/no-store settings responses. The RPCs are service-only, with a fixed postgres owner/catalog search path. Both tables have RLS and no direct browser access. Service role reads tables but cannot write preference/consent evidence directly.

The database stores exact consent wording/version/time, timezone, revocation time and a hash binding to the currently verified contact. The consent ledger retains changes without message bodies or email addresses. An opt-out records revocation immediately and remains possible after membership or verification loss. Membership removal or reassignment automatically switches the old-office preference off. Rejoining does not revive consent.

## Files

- Migration: `supabase/migrations/20261122000100_politician_notification_preferences.sql`.
- API: `app/api/settings/office-notifications/route.ts`.
- Component: `components/dashboard/question-email-preferences.tsx`, inserted into `app/dashboard/page.tsx`.
- Consent wording/validation: `lib/notifications/consent.ts`.
- Generated database function type additions: `types/database.ts`.

## Verification

1. `sh scripts/test-notification-preferences.sh`: passed the legitimate synthetic self-service lifecycle in a retained socket-only PostgreSQL cluster. Verified default off, daily opt-in, another member remains unsubscribed, consent evidence/contact binding, immediate off, revocation preserving evidence, membership departure, repeat off by former member, no consent resurrection on rejoin, RLS/effective grants and repeat migration preservation. Evidence: `/tmp/whytho-notification-preferences.wTsoDS/results.log`.
2. `lib/notifications/consent.test.ts`: three tests passed using the existing isolated tsx runtime. Current consent/timezone validation, off without renewal and daily/off pilot contract.
3. `node scripts/test-notification-preference-route.mjs <isolated-runtime>`: five route integration cases passed. Executes actual route code with synthetic authenticated-session/RPC and NextResponse boundaries: own settings load/no-store, daily save bound to session actor, off without renewed consent, sanitized read failure and signed-out access. Evidence: `/var/folders/qw/srjfzt4n78g60p0f69pbqyp40000gn/T/whytho-notification-route.YGAerd/result.json`.

No exploit reproduction was created. No production migration, deployment, remote account creation, external message, deletion or delivery worker was performed. The SQL suite retains its synthetic cluster files. A whole-repository type-check encountered incomplete/unhydrated repository dependencies and did not produce a result; focused route bundling and consent execution passed. Real browser/provider acceptance remains separate.

## T11 worker dependency contract

- Read a fresh preference immediately before sending. Require mode daily, revoked_at null, exact current consent version, confirmed email and matching SHA-256 of lowercase trimmed current email. A changed contact requires fresh consent. Recheck active verified nontest profile and exact current membership, not just the stored preference.
- Treat mode off or revoked_at as suppression for pending and retry work. No delivery table exists yet for this task to cancel; the future worker must honor current state, including already queued jobs.
- Read the T09 canonical event, then recheck question visibility/source/test status and published official-answer state. The event alone never authorizes a message.
- Daily local 9 a.m., no more than one message per recipient per rolling 24 hours across offices, requires separate timezone batching and durable send state. Preference storage does not implement scheduling or claim those delivery guarantees.
- Add one-click tokenized email unsubscribe and authenticated preference management to the actual outgoing template when delivery is built. Current T10 provides authenticated self opt-out; no email unsubscribe link or token exists because no outgoing notification has been activated.
- A provider bounce/complaint suppression store must remain authoritative even if a member later opts in again. This migration is not that global suppression store.
- Exact cohort/template/sender approval, one-week shadow run, idempotent delivery/retries/webhooks and independent staging acceptance remain pending. No paid service or new secret was provisioned.

## Release limitations

Apply and verify the migration on designated staging before deploying the API/UI. Existing provider access and fixture tests do not establish production acceptance. The migration's profile lock follows account membership operations' lock order; full delivery concurrency and opt-out race acceptance must be tested with the actual worker. The additive tables reference users/profiles without cascade deletion; later account-retention work must reconcile that audit-preservation choice under the approved private-data policy.
