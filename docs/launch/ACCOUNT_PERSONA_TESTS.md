# Politician account readiness and persona verification

> **November 22 roster update:** The [Congress roster check](CONGRESS_ROSTER_RECONCILIATION_20261122.md) covers all 539 currently serving members. It identifies seven profile changes and the House delegate, resident commissioner and office succession cases to exercise with controlled accounts. See the [latest launch checkpoint](LAUNCH_READINESS.md) for current local and hosted test status.

> **October 31 release update:** The approved database and application release is now live at whytho.us. See [production release and acceptance evidence](PRODUCTION_RELEASE.md) for the current status, final migration versions, 50 account database scenarios, and remaining launch gates. The assessment below records the pre-release work; references to undeployed/local-only fixes describe that earlier checkpoint.

Assessment date: October 30, 2026, America/Los_Angeles.

The account fixes and the local persona verification are complete. This is a tested release candidate, not a claim that the new migration or code is live. Apply the account and security migrations before deploying the application, then run the provider acceptance checklist below in an isolated test environment.

## What was fixed

| Priority | Observed failure | Implemented behavior | Evidence |
|---|---|---|---|
| P0 | An admin could remove another profile's member by submitting that membership ID with their own profile ID. | Team mutations bind the target membership and authenticated actor to the same locked politician row. | Cross-profile negative SQL assertion; team handler scope test. |
| P0 | Claim, staff changes, and answer publication checked permissions separately from the write. Concurrent requests could violate ownership or publication rules. | Service-only transactional functions serialize profile changes, recheck the current member role, and serialize official answers on the question. | Four actual parallel PostgreSQL scenarios. |
| P1 | Simultaneous claims could race; repeated unverified claims could reserve many profiles. | One owner wins; resumption is idempotent; five new attempts/hour and five pending admin claims/account. A per-actor advisory lock protects the pending-claim limit. | Claim SQL and route tests, including allowed resume at the cap. |
| P1 | The final admin could leave and silently unclaim a profile or strand other staff. | Transfer administration first. Concurrent departures retain one admin. Staff can leave without changing verification status. | Last-admin negative and concurrency assertions; Chrome disconnect interaction. |
| P1 | Auth user lookup depended on the first page of accounts. | Adding staff resolves the specific normalized email inside the transaction. Team directory uses exact user-ID lookups and returns other members' email only to admins. | SQL normalized-email test; handler privacy test. |
| P1 | Responders' existing drafts were hidden and could not be resumed after the published-answer edit window. | Responders see and edit their own private drafts; editor/admin sees the review queue. Private drafts have no 15-minute expiry. | Dashboard role matrix, SQL old-draft edit, Chrome responder workflow. |
| P1 | Admin/editor had no explicit way to save a private draft. | Verified publishing roles can choose Save private draft or Publish response. Server-confirmed state controls success and sharing UI. | SQL, handler, and Chrome private-draft cases. |
| P1 | Approval of an old draft immediately expired its public edit window because the window used draft creation time. | `published_at` starts the existing 15-minute window at publication. Original creation time remains intact. | SQL approve-old-draft followed by editor correction. |
| P1 | Claim/team/approval/edit actions did not retain a complete actor history. | Private, RLS-protected `politician_account_audit` stores actor, action, profile, subject and timestamp without message bodies or emails. | Actual ledger assertions, access privileges, repeat migration. |
| P2 | UI could silently show an empty team after failure or stale controls after actions. | Team load errors have Retry; role, invitation, departure, approval and edits refresh the dashboard. Answer actions invalidate the public profile cache. | Chrome retry and state changes; handler checks. |
| P2 | Invalid request shapes, unrecognized answer types and unsafe source URLs reached deeper handling. | Account handlers reject malformed bodies, invalid UUIDs, invalid roles/types, and non-HTTPS/credential-bearing/excessive sources. Unexpected database details are hidden. | Real handler negative tests. |
| P2 | Answer text, source and statement fields lacked associated labels. | Each editable field now has a label linked to its input. | Actual component inspection and Chrome interaction. |

Independent integration review found that the production service role cannot SELECT `auth.users`; the original local fixture had granted that access accidentally. All three account RPCs now use fixed-owner (`postgres`) SECURITY DEFINER execution with a `pg_catalog` search path, schema-qualified application tables/types and service-only EXECUTE. Browser roles cannot call them with a forged actor ID, and the corrected fixture proves the functions work without granting broad access to auth records.

The five-pending-claims cap is a protective operational default. Legitimate staff managing larger portfolios should complete verification or use a reviewed support process. It does not verify identity by itself.

## Personas exercised

| Persona | Scenarios and expected behavior | Verification layer |
|---|---|---|
| Signed-out visitor | Safe sign-in return; account and mutation gates; no privileged write. | Handler/server page; SQL role privilege assertions. |
| Anonymous authenticated visitor | Cannot claim profiles, manage a team or access account records. | Handler/server page and PostgreSQL. |
| Registered constituent | Cannot answer for a politician or read their team; notification settings only affect the session identity. | Handler and PostgreSQL. |
| New claimant | Claims an unclaimed active profile; creates self-claimed tier 1 only; competing claimant denied. | PostgreSQL and handler contract. |
| Pending politician admin | Resumes existing claim; prepares/edits private drafts; cannot approve/publicly answer or change public profile/photo. | PostgreSQL, handler/server page, Chrome component workflow. |
| Verified politician admin | Staff grants/changes/revocation; private or published answers; draft approval; public profile/photo controls; transfer before departure. | PostgreSQL, handler/server page, Chrome. |
| Verified editor | Publishes or saves draft; approves draft; edits within publication window; cannot manage staff or change photo/profile. | PostgreSQL, handler/server page, Chrome. |
| Responder | Sees own drafts, edits old private draft, saves new private response; cannot approve, edit others' drafts, alter published answers, or manage staff. | PostgreSQL, handler/server page, Chrome. |
| Removed member | Loses access at mutation time; publication queued behind revocation is denied. | PostgreSQL race, handler denial and Chrome error state. |
| Admin of unrelated profile | Cannot remove someone from the other profile or answer there. | PostgreSQL negative cases and route target-binding test. |
| Platform administrator without politician membership | Site admin status does not grant authority to speak for a politician. | Handler negative case. |
| Last remaining politician admin | Cannot disconnect or demote self; a simultaneous departure preserves another admin. | PostgreSQL and Chrome. |

## Executed results

- **46 PostgreSQL assertions/scenarios passed:** 42 permission, lifecycle, audit, idempotency, claim-budget and function-privilege checks plus four real concurrent transaction scenarios. The functions under test are the migration's actual PL/pgSQL, running in a newly created local PostgreSQL 17 cluster with synthetic users and profiles. Fixtures are retained, and the server is stopped afterward.
- **29 real-handler/server-page integration tests passed.** These load the actual Next route/page modules and replace external Supabase/email/cache boundaries with fixtures. They test request/response contracts, rendered role branches, error handling, private media access, safe redirects, and source validation. They do not independently prove the mocked database behavior; the PostgreSQL suite covers that boundary.
- **9 Chrome component-browser scenario groups passed, with zero browser exceptions.** Real production React components were bundled and clicked in headless installed Chrome. API/auth/router boundaries were mocked and nonlocal network requests were blocked. The scenarios cover staff edits/addition/removal, error/retry, responder editing and drafting, editor drafting/approval/publication, pending profile restrictions, last-admin departure, photo permission/credit gating, and revoked/ambiguous publication errors.
- Targeted account ESLint and `git diff --check` passed for the working tree at this checkpoint. Full application build/type/lint status is recorded in the consolidated launch report after integration with the security/dependency work.

Evidence:

- [Database output](evidence/account-database-tests.log)
- [Handler and page test output](evidence/account-route-tests.log)
- [Chrome structured results](evidence/account-browser-results.json)
- [Admin component screenshot](evidence/account-admin-team.png)
- [Responder component screenshot](evidence/account-responder-draft.png)

The screenshots use a minimal isolated test harness, not the complete production site's styling. They are interaction evidence, not a visual-design signoff.

## Reproduction

From the repository:

```sh
sh scripts/test-account-database.sh
```

The runner creates its own local socket-only cluster and ignores production database URLs. On a sandboxed macOS host it needs permission to create PostgreSQL shared memory. It preserves generated test evidence and performs no production requests. It tests synthetic membership removal to exercise the requested lifecycle; no real member is removed.

From a local-disk checkout with project dependencies installed:

```sh
node --import tsx --test scripts/release-integration.test.ts
```

For the Chrome component suite, install Playwright in a separate temporary runtime once, then run:

```sh
npm install --prefix /tmp/whytho-account-browser-runtime --no-audit --no-fund playwright
node scripts/account-browser-check.mjs /tmp/whytho-account-browser-runtime
```

The browser runner uses the installed Google Chrome binary at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Its bundle, screenshots, JSON results and browser profile remain in the printed scratch directory. No fixture endpoint or authentication bypass is added to the application.

## Deployment and remaining acceptance gates

1. Review and apply `20261031205615_account_transitions.sql` before the updated routes. It adds functions, private audit storage and `published_at` without changing existing civic rows. The claim route also requires the security migration's durable-rate-limit function.
2. Deploy the tested application. No production deployment or database mutation was performed by this account test work.
3. In an isolated staging environment, complete real OAuth/magic-link login, logout, session expiry and verification delivery with designated test recipients. Current tests replace these providers and do not prove inbox delivery, OTP redemption, OAuth provider configuration or session-cookie continuity across a real provider redirect.
4. Load reviewed official website/email-domain sources before enabling automatic identity verification. A claim alone does not establish a politician's identity. Security and legal reports cover this boundary.
5. Confirm existing-team invitation and newly approved answer notifications reach approved test recipients and honor preferences. The existing direct-answer email path is best-effort; reliable delivery and notification after draft approval belong to the notification-outbox rollout. No messages were sent by these tests.
6. Establish a reviewed support procedure for contested claims and a final admin who needs to release a profile. The public UI intentionally does not revoke an entire team's authority when one admin leaves.
7. Run the complete deployed site on mobile and with assistive technology after integration. The component browser tests verify interactions and field labels, not a full accessibility audit or live-provider E2E.

These residual gates are explicit release conditions. Passing the local suites does not make unreviewed identity proof, real provider configuration, or production rollout complete.
