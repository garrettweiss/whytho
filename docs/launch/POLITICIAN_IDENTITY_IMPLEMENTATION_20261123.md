# Politician identity repair implementation

Status: production release deployed and all 432 approved identity links applied; live and preservation checks passed. November 22 local time / November 23 UTC, 2026.

Garrett authorized implementation with “Continue with plan and fix,” then explicitly approved deployment and the 432 verified links. The isolated release is commit `d4c5ce31f4250868e46937b120be41308fa5afde` on `main`. Both additive migrations are installed. No profile rows, questions, answers, votes, files, or history were deleted.

## Verified repair population

The complete 11,513-profile inventory was checked against the public current and historical Congress Bioguide/FEC crosswalk. The evidence supports 427 people represented by 859 profiles, yielding 432 source-to-canonical links. These are provider-ID matches, not name-only guesses. The original generated manifest remains unmodified. The separately approved copy is pinned to SHA256 `c1515ae2a7c2465b439deeb33770f261b7cf12dfe26388ac7c2bc1faf297218e`; its fresh 432-link production preflight passed.

- AOC keeps `alexandria-ocasio-cortez-new-york`, its portrait, aliases, social metadata and existing question history. The duplicate's FEC identity remains recorded in the source row and the provider registry. AOC also receives a missing Democrat party value backed by the donor record and current congressional term. Across the batch, 416 missing party values are supported; 10 uncertain party fills remain held, and populated values are preserved.
- Of the original 188 apparently strong exact-name/seat groups, 187 were verified. The remaining group confuses Bob Menendez (M000639 / H2NJ13075) with his son Rob Menendez (M001226 / H2NJ08232). They remain separate.
- Of 441 original flagged groups: 348 verified, 91 still require identity evidence, and two rejected matches remain separate (the Menendez pair and the state/federal Mike Johnson namesakes).
- The crosswalk also identifies 78 verified groups wholly outside the original name-based core and verifies 63 supplemental surname/seat pairs. These counts overlap and must not be added together.

Evidence: `outputs/politician-identity-audit-20261122/reviewed-crosswalk-links.json`, including original-file hashes, exact provider matches, source URLs, per-entry hashes, proposed stable anchors and deterministic decision IDs.

A second read-only production capture completed at 2026-11-23 03:39:59 UTC. All public profile metadata, per-profile relationship counts, votes, race references, account-audit references and historical snapshots were unchanged. Evidence: `outputs/politician-identity-refresh-20261123/drift-check.json`. Another fresh preflight is mandatory immediately before application.

## What the implementation changes

1. **One public identity, retained originals.** Add `canonical_politician_id`, a provider registry, immutable decision history and observations. No existing question/answer/vote/weekly-snapshot ownership is rewritten. Identity groups cannot chain, cycle, absorb test accounts or silently inherit team authority.
2. **Preserve the stronger profile.** Anchor ranking favors authority, real participation, established official IDs/content, useful profile information and the permanent URL. Existing photos, provenance, bios, verification, roles and slugs stay intact. Link-time edits are restricted to reviewed missing party information and additional aliases. Other source information remains accessible as provenance for deliberate review.
3. **Consistent public presentation.** Directory/search/index/sitemap, profiles, response counts, leaderboards and race cards resolve the same canonical identity. Counts use original distinct question IDs and strict original answer ownership. Index/sitemap use complete 500-row pages, avoiding the API's 1,000-row cap.
4. **Working old links.** Old slugs render the canonical record and carry canonical SEO metadata. Client navigation preserves the complete query and question/answer fragment. This deliberately avoids Next's streamed server redirect, which dropped fragments in the real browser test. Without JavaScript, the old URL still displays the canonical record.
5. **Prevent recurrence.** Congressional, federal-candidate, FEC and governor importers use one transactional provider-ID resolver and default to preview. Missing/failed lookups cannot masquerade as absent people. Ambiguous name/seat cases stop for review. Candidate observations remain dated; a loss cannot deactivate a person's unrelated office or erase their history.
6. **Preserve X history.** Collection requires a verified, unambiguous handle and visits each identity once. Existing source IDs, attribution and outreach history remain intact. A service-only publisher transaction handles canonical new questions, retries and legacy duplicate cases. Outbound messaging remains disabled by the existing guard.
7. **Controlled application.** The runner requires an explicitly approved manifest, a pinned SHA256, fresh metadata/provider/authority/dependency checks, retained snapshots, deterministic retry IDs and post-link cache invalidation. It stops on unrelated drift.

All 427 selected anchors already have portraits. No proposed link has a populated source photo, biography, website or social profile missing from its chosen anchor. New imported portraits without reviewed rights are explicitly flagged for enrichment review; they cannot silently replace existing photos.

## Validation completed

- The integrated checkpoint passed 186 application/helper/route tests, type validation and its production build. The separately isolated identity-only release passed 182 tests and TypeScript, plus its production build and seven public-data integration checks, without pending account/notification/correction changes.
- The full application rehearsal used all 859 captured public profiles with synthetic dependent records and three additional synthetic profiles. The actual application runner through local service-role PostgREST completed all 432 proposed links plus two extra triple-case links, retained all 862 profiles, and replayed all 434 decisions with zero additional writes. All 20 supported dependency-count keys and exact permitted alias additions were checked. Local timestamp representations were normalized before pinning the rehearsal inputs. Evidence: `outputs/politician-identity-validation-20261123/batch-rehearsal-summary.json`.
- Real PostgreSQL 17 tests exercised preservation, RLS/grants, false-match guards, exact source answer ownership, archives, imports, retries and concurrent import/link/claim/question/publication writes.
- The final identity database suite passed 72 PostgreSQL assertions and concurrency checks. The identity-only schema path also passed without pending November schemas.
- Atomic X publication passed 38 SQL assertions plus concurrency checks for both clean and legacy-duplicate history.
- Seven real local PostgREST checks exercised the actual public server modules: canonical/old profiles, aliases, fuzzy search, full index and sitemap populations above 1,000, race memberships/incumbents and leaderboards.
- Real Chrome confirmed the AOC example clears stale California/State Senate filters and returns one card. It also confirmed an old profile link retains `period=all`, `sort=newest` and its original question anchor after navigation.
- All tests used synthetic local records. No production imports, pipeline jobs, provider spending or messages were run.

Screenshots from synthetic local data: `/private/tmp/whytho-identity-search.jpg` and `/private/tmp/whytho-identity-preserved-link.jpg`. The synthetic portrait intentionally uses an unavailable test URL; the preservation assertion verifies the original stored photo URL remains unchanged.

## Release sequence

1. Use `/private/tmp/whytho-identity-release.td3s04et` and its `IDENTITY_RELEASE_MANIFEST.json`, keeping unrelated pending account, notification and correction work out of this release. Confirm the two new identity/publication migrations on the live schema without those pending migrations.
2. After explicit production authorization, apply only the two additive identity/publication migrations. They start with zero approved links.
3. Deploy the canonical-aware app and importer code. Verify the zero-link behavior before activating any reviewed mapping.
4. Recheck the crosswalk and live preservation evidence. Produce the explicitly approved batch with pinned file hash. Run preview, then a small AOC canary and verify identity, portrait, questions, old links and authority boundaries. Apply the remaining verified links only after the canary passes.
5. Call `POST /api/admin/identities/revalidate` using the existing internal admin secret, then verify public pages, counts, cache behavior, search/sitemap uniqueness and all preservation totals.
6. Keep the 91 unverified core groups and both rejected pairs separate. Additional links require evidence, not a lower matching threshold.

If verification fails, stop the batch. Completed links have original rows and decision snapshots for a separately reviewed reversal. Do not roll the application back to code that does not understand canonical mappings, and do not delete source rows as rollback.

The release snapshot’s `.next` build used synthetic loopback data only. Deploy source with the configured production environment; do not publish the local `.next` output or its synthetic `.env.local`. The source was deployed through the existing Git integration, using the configured production environment. The two approved migrations and all 432 approved identity links are live; batch completion and preservation checks are recorded in `outputs/politician-identity-production-20261123/release-status.json`.


## Production result, November 22 local / November 23 UTC

Garrett explicitly approved deployment and the verified 432-link batch. Both additive migrations were applied through the existing Supabase CLI after its dry run confirmed only the approved files. The MCP migration token lacked write scope, and Vercel CLI login could not complete. The already-authorized Git integration published the exact tested release commit `d4c5ce31f4250868e46937b120be41308fa5afde` to `main`; production built successfully in 2m 8s.

Production deployment: https://vercel.com/garrettweiss-projects/whytho/2TRbazdhtoqxFyNxDuvVKMQ8LgEr

A fresh full preflight passed all 432 links. AOC was linked first and verified in live Chrome: its example clears stale state/office filters, one portrait-backed card appears, all three historical questions remain, and the old slug preserves query parameters and the question fragment. The full runner recognized that canary as already applied and linked the remaining 431 without a mismatch.

Final preservation validation retained all 11,513 database profiles and every original question, answer, vote, snapshot, X attribution, outreach and authority reference. Exactly 432 source profiles link to 427 canonical profiles, yielding 11,079 active public identities. The reviewed missing party fills total 416. Original aliases remain; the permitted copies increase alias rows from 9,225 to 9,653. The ledger contains 432 approved decisions, 432 observations and 860 provider identifiers. Every decision records the exact approved manifest SHA256.

The public index and sitemap contain every retained canonical profile and exclude all 432 alias slugs. Canonical SEO metadata was checked on original and alias URLs for AOC and three additional politicians. Home, leaderboard and races return HTTP200, public responses set no auth cookies, and the warmed index is a shared-cache HIT. Cache invalidation succeeded after the canary and final batch. The in-batch health endpoint was healthy with all 24,647 questions.

Evidence: `outputs/politician-identity-production-20261123/release-status.json`, `preservation/validation-2026-11-23T04-26-02-742Z.json`, `public-verification.json`, `batch-apply.log` and `aoc-live-search.jpg`. Before snapshot SHA256: `36ad9a195e6bd4fad4289575ed7d511af8ba96f4415e81aba89cf69051ec1e97`.

The 91 unverified original groups and both rejected namesake matches remain separate. No original rows, files or history were deleted, and no messages or X publishing jobs were sent.
