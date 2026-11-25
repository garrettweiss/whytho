# Independent security review

> **October 31 release update:** The approved database and application release is now live at whytho.us. See [production release and acceptance evidence](PRODUCTION_RELEASE.md) for the current status, final migration versions, 50 account database scenarios, and remaining launch gates. The assessment below records the pre-release work; references to undeployed/local-only fixes describe that earlier checkpoint.

Reviewed October 30, 2026, America/Los_Angeles. This is an independent code, migration, and targeted regression review of the launch candidate. It is not a comprehensive penetration test or production certification. Fixes below are local and require the release process; nothing was deployed by this reviewer.

## Result

One additional verification-state defect was reproduced and fixed. A separate account privilege defect found by the lead security reviewer was independently reviewed after correction. No additional demonstrated authorization bypass was found in the inspected paths. The production deployment, verification-source review, and operational gates in `SECURITY_AUDIT.md` remain necessary.

### Fixed: verification proofs could resume after their evidence changed

**Priority P1 for verification correctness; no demonstrated tier-escalation bypass.** Both proof APIs accepted the `reviewed_source_v1` marker and current website/email domain without comparing the proof's recorded `source_url` to the current reviewed source's `evidence_url`.

Consequences:

- A completed proof could return `already_verified` after its reviewed evidence changed.
- A pending meta proof could keep being reused by Generate, although the database completion trigger rejected its stale source. The user could not obtain a current challenge through this flow.
- A pending email proof reached a completion attempt that the database trigger would reject, instead of asking for a fresh code.

Both routes now require the current evidence URL. Stale email proofs require a fresh request. Stale meta proofs are refused on Check and produce a new random challenge on Generate. Existing proof history is preserved. The database trigger remains the final transaction-level source and current-admin check.

Changed files: `app/api/verify/gov-email/route.ts`, `app/api/verify/meta-tag/route.ts`, `scripts/security-integration.test.ts`.

**Directly executed evidence:** real route modules loaded with database, email, limiter, and HTTP boundaries mocked. The expanded suite has 10 tests. Two new tests cover pending and completed email/meta proofs and meta regeneration. A retained pre-fix scratch copy produced 8 passes and 2 failures, each accepting HTTP 200 where 422 was required. The corrected copy passed 10/10. These handler tests do not claim to simulate PostgreSQL triggers; the trigger review explains why stale pending proofs were rejected in the actual database.

Command: `node --import tsx --test scripts/security-integration.test.ts`.

Retained isolated runs: `/tmp/whytho-source-review-regression-i3ap2egw` (pre-fix predicates), `/tmp/whytho-independent-security-77z0knwj` (fixed). The isolation avoids this iCloud workspace's unreliable dependency hydration. No live verification messages were sent.

### Independently reviewed: account RPC privilege correction

The lead reviewer found that production `service_role` does not have SELECT on `auth.users`; the earlier test fixture had granted that privilege and masked a runtime failure in the three account functions. The corrected `20261031205615_account_transitions.sql` uses narrowly granted `SECURITY DEFINER` functions owned by `postgres`, rather than granting general auth-table access.

Reviewed the final definitions of `claim_politician_profile`, `manage_politician_team`, and `save_politician_answer`:

- `search_path` is `pg_catalog`; application tables and enum types are schema qualified; there is no dynamic SQL.
- PUBLIC, anon, and authenticated execution is explicitly revoked for each exact signature; only service_role receives execution.
- HTTP callers derive the actor ID from `auth.getUser()`, not a submitted actor field.
- The functions still validate a real non-anonymous auth user, current profile/team authority, permitted action, and state transitions inside the transaction.
- Profile row locking serializes claims and team changes. Answer writes lock the profile and question before role checks and publication. This orders team removal and answer publication: either the authorized write commits first or the subsequent write sees the removal.
- Last-admin protection and official-answer uniqueness are checked while those locks are held.

The security lead separately executed the corrected fixture without the excess auth grant, including browser execution denial and concurrency tests. Those results belong to the lead/account reports; they are not represented as additional independent executions here.

## Adversarial boundaries inspected

| Boundary | Attack or failure considered | Result and evidence |
| --- | --- | --- |
| Browser to account functions | Supply another actor, call RPC directly, edit another profile, publish a responder draft directly | Service-only execution plus server-bound actor and transaction-level membership/type checks prevent the inspected paths. The database is the final authority, including after an earlier HTTP permission check. |
| Last-admin and removal races | Concurrent demotion/removal, publish after removal, duplicate official answer | Shared profile lock serializes team changes and answer operations; question lock serializes competing publications. No check-then-write authority gap found in those functions. |
| Private drafts and chatbot | Retrieve private drafts with the model's tools, inject a client tool result or system role | Chat retrieval uses the public client and explicit non-draft filtering. Input parser accepts bounded user/assistant text only. Chat question tool prepares a draft rather than publishing. Prompt rules alone are not treated as a security boundary. |
| Verification authority | Use any unrelated .gov email, claimant-edited website, old proof, or removed admin | Exact independently reviewed office domains and private reviewed website source are required. Completion trigger checks current admin/source. Newly found stale-source API mismatch is fixed above. Domain review remains an operational trust decision. |
| Verification SSRF | Private IP, mixed public/private DNS results, DNS rebinding, redirects | HTTPS validation rejects credentials, explicit ports and IP literals. DNS answers are checked, HTTPS connects to a pinned public IPv4 address, and verification redirects are refused. This was code review, not live network probing. |
| Portrait importer SSRF | Untrusted redirect to private host, large/non-image response, identity mismatch | Downloader rechecks and pins each redirect, caps bytes and time, and limits content types. Importer requires a reviewed exact-ID rights manifest and normalizes image bytes. No name-only automatic publication remains in the reviewed importer. |
| Portrait authority | Upload while role or tier is revoked; supply cross-profile URL; overwrite a newer team portrait | Initial admin/tier check precedes upload; the final service-only transaction locks and rechecks admin/tier. Its URL must contain the same profile ID and a JPEG object path. Importer uses a conditional old-photo update. Objects use fresh random paths, not overwrites. |
| Uploaded image parsing | Spoof extension/MIME, SVG active content, image bomb, metadata leakage | Sharp decodes only still JPEG/PNG/WebP, enforces input size/pixel/dimension limits, and emits a resized JPEG without source EXIF. The resulting profile image is not the untrusted original. |
| Admin privilege | Change `user_profiles.is_admin` to gain Jack access | Migration removes browser profile writes including column grants and switches affected Jack policies to signed app metadata. Revoking public-schema CREATE and restricting maintenance grants reduces object-shadowing/privilege risk. |
| Request boundary and cost | Browser cross-origin write, large chat conversation, missing shared limiter | Middleware rejects cross-origin/same-site mutation requests and unexpected body content types. Bounded chat parsing and durable user/IP limits fail closed on limiter failure. Native requests without Origin are not authentication; handler checks remain required. |
| AI evidence | Model invents its own citations or self-certifies a seed | Evidence is supplied through a reviewed caller input, with source/date/excerpt validation; model output cannot certify it. This gate validates structure and provenance workflow, not the truth of arbitrary reviewed text. |

## Production read-only observations

Read-only catalog queries against project `jjwdxjqsnwieksubkkkf` confirmed the verification table has only its primary/foreign keys, without a hidden uniqueness constraint that would prevent issuing new challenges. Existing storage policies returned by that query were for `answer-media`, with false predicates; no browser-write portrait policy was present in that result. Public bucket asset serving and object-list authorization are distinct. No production write, exploitation request, account impersonation, or message delivery was performed in this review.

## Residual limits and follow-up

1. **Release gate:** migrations, application handlers, dependency updates, and current source records must be verified together on the release environment. Local green tests do not establish deployed behavior. Verify exact routine grants/owners there before enabling politician onboarding.
2. **Reviewed-source operations:** new verification intentionally fails closed without an independently reviewed source row. Source edits do not automatically revoke already granted tier 2 status. A compromise or withdrawn source requires an explicit operational suspension/review decision and audit trail, rather than treating a cosmetic evidence-URL edit as automatic de-verification.
3. **P2 storage lifecycle:** a photo can be uploaded before final profile authorization fails. The random-path object can remain in the public bucket without being linked from the profile or recorded in the successful portrait history. The failed response does not disclose its URL; initial upload required a verified admin and permission attestation. This is a retention/accounting gap, not an observed cross-account publication bypass. A later private staging/finalization design or reviewed orphan-retention process should track unsuccessful uploads. No objects were deleted as part of this review.
4. **Availability:** verification HTTP has an inactivity timeout and byte cap but no separate total wall-clock deadline around DNS plus a slowly streaming response. Only an independently reviewed site is fetched and attempts are metered, which narrows abuse. Add a total deadline if this worker is enabled at scale. The portrait downloader already has a request deadline.
5. **Independent scope:** no live penetration test, production role impersonation, mail deliverability test, cloud-console audit, full dependency exploitability audit, or automated browser test was performed by this second reviewer. Separate team reports contain their own executed evidence. Legal rights and identity assurance for historical portraits remain separate launch gates; security normalization cannot establish copyright permission.

## Follow-up: local Origin mismatch

The parent production-build smoke observed HTTP 403 with `Origin: http://127.0.0.1:8775`, while `Origin: http://localhost:8775` reached the expected unauthenticated HTTP 401. This was traced to installed Next.js 15.5.28: `NextURL.parseURL()` rewrites loopback hosts to `localhost`; `next start` also constructs its middleware URL from the listening hostname and port. This behavior is consistent with the Next.js project's [self-hosted middleware hostname explanation](https://github.com/vercel/next.js/issues/36625).

Directly constructing real `NextRequest` instances confirmed that `127.0.0.1:8775` becomes `localhost:8775`. `https://whytho.us`, `https://www.whytho.us`, and a deployment `https://deployment-name.vercel.app` retain their exact origin. Injecting `x-forwarded-host: attacker.example` and `x-forwarded-proto: http` did not change those URL origins in this check.

No policy change was made. Use the canonical `localhost` origin for local smoke. There is no evidence from this local alias mismatch of a Vercel hostname failure or an authorization bypass. The deployed same-origin check remains part of release validation. If self-hosting behind a proxy with an internal listening hostname is introduced later, configure a trusted canonical public origin explicitly; do not fix the mismatch by trusting arbitrary forwarded headers or treating all loopback aliases as equivalent browser origins.
