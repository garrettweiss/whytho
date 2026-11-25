# Portrait readiness and replacement queue

> **October 31 release update:** The approved database and application release is now live at whytho.us. See [production release and acceptance evidence](PRODUCTION_RELEASE.md) for the current status, final migration versions, 50 account database scenarios, and remaining launch gates. The assessment below records the pre-release work; references to undeployed/local-only fixes describe that earlier checkpoint.

Assessment completed October 30, 2026, America/Los_Angeles. This combines a read-only live inventory, an HTTP/image-metadata check of every recorded non-test portrait and implemented local upload/import safeguards. No live portrait, database row or storage object was changed or deleted.

**Outcome: most profiles have a URL, but acceptable quality and lawful reuse have not been established for most profiles. This request remains a launch gate.** A rights attestation, public URL or automatic dimension check cannot guarantee zero legal risk.

## Full inventory and observed quality

| Measure | Count | Meaning |
|---|---:|---|
| Active non-test profiles | 11,511 | Two additional active test records excluded |
| Nonempty portrait URLs | 7,615 | 66.15% coverage by URL only |
| Missing or blank URLs | 3,896 | 3,500 null and 396 empty strings |
| Mirrored portrait URLs | 5,784 | Hosting a copy does not establish rights |
| Populated original source field | 0 | No recorded provenance in this field |
| Every URL checked | 7,615 | 7,615 distinct profile IDs, no duplicate results |
| At least 400 x 400 | 1,860 | 1,849 are exactly square 400 x 400; not a visual or rights approval |
| At least 200 x 200, below 400 x 400 | 1,925 | Small portrait, larger original needed for new upload standard |
| Below 200 on either dimension | 2,120 | Too small for the intended prominent portrait |
| Failed or refused under audit policy | 1,710 | Includes 645 HTTP 404, 325 TLS certificate failures, 299 non-image responses, 251 insecure URLs, 77 HTTP 403, 56 timeouts, 35 over 5 MiB, and other DNS/network errors |
| Meets new-upload minimum 400 x 500 | 11 | Pixel requirement only, not approval of identity, blur, crop or rights |

Dimension checks are deliberately separate from legal review. HTTP 403/timeouts and audit safety rejections do not prove that an image is permanently broken in every visitor's browser. They require source investigation. The audit validates image metadata, not a complete human inspection of image content.

Evidence: [completed summary](evidence/portrait-quality-v2.json), [all per-profile results](evidence/portrait-quality-v2.jsonl), [11,511-row editorial queue](evidence/portrait-review-queue.csv). The older `portrait-quality.json` is explicitly invalid: the initial Node 22 connection lookup was incompatible with automatic address-family selection. Its failures are diagnostic evidence only, superseded by the successful probe and full corrected run. The completed run is resumable, DNS-pinned, bounded and read-only.

## Implemented changes

- Verified profile admins can choose a file, preview the center crop, supply creator credit, accept the specific portrait-use permission and save from their dashboard. Editors, responders, anonymous users, unverified claimants and unrelated admins cannot publish a replacement.
- The server permits still JPEG/PNG/WebP up to 4 MiB and 20 million decoded pixels, requires at least 400 x 500 after orientation, strips metadata and creates a new 400 x 500 JPEG. A shared quota allows ten upload attempts per actor/day.
- The final transaction rechecks current authority, records actor/credit/permission version and old/new image URLs, and refreshes the profile cache. Previous files are retained. If permission is revoked after upload but before publication, publication fails and the unreferenced public portrait object is retained for reconciliation.
- Public image credit distinguishes team-supplied permission from imported licenses and links source/license/change information. Failed-image fallback recovers when a new URL is supplied.
- Imports default to preview, require an exact-profile rights manifest, fetch only bounded public HTTPS images, preserve unique versions and reject in-place reprocessing. Name-only matches and unreviewed discovery no longer publish images.

These controls are implemented and tested locally; the portrait migration and application have not been deployed. They do not retroactively clear the legacy collection.

## Work order to complete coverage

1. Start with a small neutral launch cohort, then federal incumbents/governors, then state and local cohorts. Sort the CSV by repair priority and office; within each cohort review all rights, regardless of image quality. The CSV gives each profile a row and empty editorial evidence fields. It contains no invented licenses or approved identities.
2. Repair missing, unreachable and invalid images first; replace undersized images with larger originals; then review apparently usable assets. Recheck the current URL immediately before action because this queue is a snapshot, not authority to overwrite subsequent changes.
3. For every candidate, capture exact source file/page, original creator, specific license/permission, identity evidence, review date/reviewer and intended modifications. Official federal work requires documented federal employee authorship in official duties. State/local government, campaign, contractor and news images require their own rights basis. A Commons file needs its own review.
4. Human-review likeness, office identity, recency, crop, blur, orientation, watermarks and credit. Do not upscale a small file and call it a quality repair. A verified office can supply its own licensed original through the new upload flow after rollout.
5. Convert approved rows to the strict manifest in `lib/photos/rights.ts`; preview the exact profile/source/license list. Preserve the reviewed manifest and import output as the editorial audit record. Apply in small batches after the migration, refresh affected profile/directory caches, and inspect public results. No automatic import has been activated by this work.
6. Before promotion, use only cleared images for marketing and the pilot cohort. Resolve a reversible display-quarantine policy for unknown legacy images with the operator/counsel. Preserve originals and history; no deletion is part of this plan.

Acceptance: all marketed profiles individually cleared, zero broken portraits in the pilot, source/license/credit visible as required, verified admins can replace their own image and revoked staff cannot. For broader rollout, target at least 90% of active profiles with reviewed, visually acceptable portraits; the remainder must have an intentional placeholder. Current URL coverage does not satisfy that target. This target is a proposed product acceptance criterion, not a legal standard.

## Reproduction and limits

Run `node --import tsx scripts/audit-portrait-quality.ts --concurrency=6 --output=<new-prefix>` for a fresh live read-only audit. Use `scripts/build-portrait-review-queue.ts <audit.jsonl> <new.csv>` to create a review queue without overwriting existing editorial work. Environment credentials are read locally and not printed. The import script is distinct and must not be confused with these read-only audits.

Photo coverage cannot be completed honestly without per-asset evidence and human identity/quality review. The [photo policy](legal/PHOTO_RIGHTS_POLICY_DRAFT.md), [legal register](LEGAL_RISK_REGISTER.md) and [account tests](ACCOUNT_PERSONA_TESTS.md) define the review and permission boundaries. Relevant primary guidance: [US government copyright](https://www.usa.gov/government-copyright), [Commons reuse](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [CC BY-SA 4.0 terms](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en).
# November 22 congressional inventory

The [dated inventory](evidence/congress-profile-photo-inventory-20261122.csv) reconciles 441 House roster entries and 100 Senate entries against public WhyTho profiles by Bioguide ID. Two House entries list no member. Of the remaining 539 entries, 532 match an active profile and seven lack a match by ID. A separate [candidate report](evidence/congress-unmatched-profile-candidates-20261122.json) found plausible same-office profiles for four of the seven. Those links require identity confirmation before any profile record changes.

All 532 matched profiles have a photo URL. None records a source URL or rights basis. Treat them as permission unresolved until the exact image can be documented. Use the approved neutral placeholder for unresolved use, with the original preserved. Garrett declined a manual approval queue. The remaining work is to establish evidence during sourcing, validate quality, and test that verified office teams can replace their own portraits.

The [roster reconciliation](CONGRESS_ROSTER_RECONCILIATION_20261122.md) now identifies the four existing federal candidate profiles and three federal profiles to create. Start new profiles with the neutral placeholder while image permissions are documented.

Roster sources: [House Clerk member data](https://clerk.house.gov/xml/lists/MemberData.xml) and [Senate member XML](https://www.senate.gov/general/contact_information/senators_cfm.xml). These sources establish roster identity. Photo permission is assessed separately.

