# One person, one public profile: audit and repair plan

22 November 2026, America/Bahia_Banderas. Planning only; no production records changed.

**Recommendation:** repair identity matching across every importer, then consolidate confirmed duplicates behind one public profile. Keep the original records and URLs, combine the strongest supported data field by field, and retain every question, vote, answer and historical event. Do not implement a name-based delete or a homepage-only filter.

## What the full audit found

The inventory read **all 11,513 politician rows** in ordered 500-row pages, verified returned counts and unique IDs, and excluded 2 test profiles from matching. The remaining **11,511 are active public profiles**, not necessarily distinct people. The roster was captured at 18:37 local time and relationships at 18:39 to 18:40. These are successive read-only captures, not an atomic database snapshot.

| Finding | Count | Interpretation |
|---|---:|---|
| Strong officeholder/candidate pairs | **188 pairs, 376 profiles** | Matching normalized full name, state, office and district; one Congress identity and one FEC identity. All 188 have the full-state-name versus postal-code split seen in AOC. Strong review candidates, not automatic merge authorization. |
| Other exact-seat groups | **27 groups** | Same normalized name/state/office/seat, including governors imported more than once. Some have three profiles. Confirm source identity and dates. |
| Name or office variation groups | **226 groups** | Middle names, initials, alternate offices and other ambiguous matches. Require identity research. |
| Total core discovery | **441 groups, 906 profiles** | 417 pairs and 24 triples. One group is already rejected as different people, leaving **440 pending groups**. Do not call all 441 confirmed duplicates. |
| Supplemental nickname/suffix discovery | **69 pairs** | Same surname and seat across official/candidate sources, such as Mike Johnson / James Michael Johnson. These overlap the core population and cannot be added to the group total. |
| Same name across different states | **61 groups** | Separate manual-review list. A shared name does not establish identity. |
| Nonstandard state representation | **538 rows** | All resolve to known state/territory codes. There were no blank or unrecognized state values in the capture. |

No duplicate populated Bioguide, OpenStates, GovTrack, VoteSmart or FEC identifier was found across profiles in this snapshot. Most suspected duplicate pairs have **different providers' IDs split between rows**, so a same-ID-only scan would miss them. Only `candidate_fec_id` is populated today; two other FEC columns exist but are empty. The conflicting importer conventions remain a recurrence risk.

The 906 initially flagged profiles carry **1,410 questions, 483 weekly snapshots, 572 X posts and 14 outreach records**. Twenty-eight groups have questions on more than one source profile, and 28 have overlapping historical snapshot weeks. The core flagged cohort currently has no user-source questions, votes, answers, team memberships or verification records. That reduces immediate authority risk but is not a reason to omit protection for future activity or the supplemental review sets.

The wider directory does contain a real user-source question and votes, so all existing interactions must remain safe. Counts must be refreshed before activation.

### A real false match that the plan must reject

`mike-johnson-la` and `mike-johnson-louisiana` share a name and normalized state but represent different people: [Michael T. Johnson in Louisiana House District 27](https://house.louisiana.gov/H_Reps/members?ID=27) and [Mike Johnson in U.S. House District LA-04](https://clerk.house.gov/members/J000299). This pair is recorded as **keep separate** in the review manifest. A separate FEC profile named James Michael Johnson is a candidate match for the federal member only. Similarity chains must never pull the state legislator into that identity.

## What “best profile” means

Choose a stable canonical ID and URL, then select data from **all confirmed source records**. The best combined profile may contain information that never existed together on any single row.

| Element | Preservation and selection rule |
|---|---|
| Public identity and URL | Prefer a correctly identified profile with valid reviewed ownership or genuine official/user activity. Otherwise favor the established authoritative officeholder profile and stable URL. The manifest's suggested anchor is provisional, not approval. |
| Photo | Preserve the correct-person, supported portrait with its source URL, credit and rights evidence as a bundle. Do not replace it with a blank, arbitrary newer image or unverified image. Missing provenance stays an explicit review issue. |
| Name, bio, website, social accounts | Preserve verified owner edits and reviewed official facts. Keep alternate names as aliases. Select each social network independently; conflicting or inferred handles require review. |
| Party, current office, district | Use dated authoritative evidence. Normalize state/office representations. A campaign's party or office sought must not overwrite an incumbent's current role automatically. |
| Elections | Retain every dated candidacy, race and outcome as an association with the person. Preserve current office separately. Do not present an expired election flag as a verified current candidacy. |
| Provider identities | Keep all confirmed IDs in a namespaced registry. A person can have multiple FEC IDs across offices/cycles; one provider ID cannot be claimed by two unrelated canonical people. |
| Questions, votes, answers, media | Keep every existing record and ID. Show the union of eligible public content. Do not combine similar question text, relocate votes or reveal drafts as part of this repair. |
| Historical snapshots and audits | Preserve verbatim with original source identity. A canonical history view may derive rollups, but cannot overwrite snapshots or add stored percentages. |
| Verification and team access | Never infer authority from identity similarity. Do not union administrators, combine verification proofs or raise tiers automatically. A new claim or authority conflict stops that group for review. |

**AOC's proposed outcome:** retain `/alexandria-ocasio-cortez-new-york`, the established portrait, the RepAOC handle, 3 questions, 2 weekly snapshots and 3 aliases. Attach the confirmed FEC identity `H8NY15148` and validated party/election information from the candidate row. The candidate row currently has no attached questions or history. Its `/alexandria-ocasio-cortez-ny-district-14` URL remains usable through an alias. Her existing portrait has no stored source/credit/rights metadata; preserve it as an existing asset and flag that provenance gap rather than inventing evidence.

All 188 strong pairs have potential party and FEC-ID contributions from the candidate row. Those are field-donor suggestions, subject to source and recency validation.

## Implementation sequence

### 1. Finish the evidence manifest and lock down identity decisions

- Review all 188 strong pairs against provider evidence; investigate the other core groups and both supplemental lists. Record confirmed same-person, confirmed distinct-person, and unresolved outcomes. Fuzzy names only generate candidates.
- For each confirmed group record exact source IDs/slugs, canonical selection, each field's source, rejected conflicts, before-state hashes and dependent-record counts. Validate every group member together; do not accept transitive similarity as proof.
- Query live PostgreSQL catalog/migration history for constraints, triggers, RLS/grants, cron jobs and unexposed tables. REST schema metadata was captured, but cannot establish these details. Inventory manual/remote writers too.

**Exit:** a reviewable manifest with no unresolved identity/authority conflict in the first application cohort. All current manifest entries remain `approved_to_apply: false`.

### 2. Prevent new duplicates before consolidating old ones

- Route Congress, OpenStates, both FEC paths, governor imports and manual profile creation through one resolver. Use provider IDs first, normalized state/office/seat and dated evidence second; quarantine ambiguous records for review.
- Treat query errors and multiple matches as failures, never as “person not found.” Replace loose office substrings and partial-name-first-result matching.
- Use transaction-level locking and database uniqueness on namespaced external identifiers. Replaying or concurrently running imports must resolve the same person.
- Protect permanent slugs, verified edits, portraits, social confidence and authority fields. Imports may add supported facts, not reset good fields to null or verification to zero.

**Exit:** importer replay and concurrency checks create no extra identities, and source failures cannot insert new profiles.

### 3. Add identity mappings and complete application support

Use an additive reviewed mapping from every source politician ID to one canonical public identity, with an audit ledger and provenance for selected fields. Preserve source rows and historical foreign keys. Map directly to a canonical root; prohibit cycles, invalid/test links and unreviewed authority transfer.

Support the mapping in directory pagination, all search paths, profiles, elections, leaderboard, weekly history, realtime, claims/dashboard, submissions, AI tools, and media authorization. Canonicalize **before** pagination and counting. New content resolves its target at write time; existing content retains its original binding and permissions.

Old slugs continue to resolve, preserving query parameters and question anchors. Use a reversible temporary redirect during the canary, then a permanent redirect/canonical SEO URL only after approval and validation. Sitemap and listings show one public person. Version/invalidate relevant caches and cursors without disabling public caching.

The X pipeline must collect each reviewed person once using an unambiguous verified handle, search existing questions across the identity group, and preserve source post IDs and attribution. Pending publication must be atomic and idempotent. Historical outreach suppression must cover all approved source IDs. Existing send blocks remain in place; this task authorizes no messages.

**Exit:** the compatibility release supports both the live schema and pending notification/answer-correction migrations. Historical content and original permissions work before any duplicate is suppressed in listings.

### 4. Rehearse and activate in small reviewed batches

- Rehearse AOC, a governor triple, a middle-name variation, an office-change example, the rejected Mike Johnson pair, overlapping snapshots and claimed-profile conflict fixtures.
- Refresh evidence immediately before application. Lock profiles, detect new claims/content/edits and abort changed groups. Keep a private, idempotent before-state and decision record.
- Activate AOC first, then a small representative cohort, then the remaining approved strong matches. Ambiguous groups wait for evidence, not a lower matching threshold.
- No row, question, vote, snapshot, storage object or old URL is deleted. Suppress duplicate public identities through reviewed mappings, not a blanket `is_active=false` update that could hide history.

**Exit:** one visible person per confirmed group, all original links valid, conserved content IDs and totals, unchanged permissions, no duplicate jobs or sends, and a second application run is a no-op.

### 5. Verify, support rollback and monitor recurrence

Verify exact question/vote/answer/media/snapshot ID conservation; canonical totals are a union of original question IDs, with the same qualifying thresholds. Check draft access, portrait provenance, historical event attribution, X dedup, old forms/URLs, search beyond the first 1,000 rows and cache behavior.

Rollback deactivates the mapping/field overlay through a new audited decision, leaving originals intact. It must preserve legitimate post-activation edits; new claims or content may require an explicit split review. Permanent browser-cached redirects are a reason to defer 308 redirects until the canary passes.

Monitor unresolved-import counts, duplicate creation attempts, conflicting external IDs, identity-link changes and profile-content/cache errors. Keep rejected namesake decisions so imports do not propose them again. Review actual person/office/candidacy facts periodically; being active in the database is not proof someone still holds office or is campaigning.

## Deliverables and remaining boundary

- [Technical writer/dependency audit](POLITICIAN_IDENTITY_TECHNICAL_AUDIT_20261122.md): concrete code paths, schema hazards and integration requirements.
- [Review manifest, CSV](../../outputs/politician-identity-audit-20261122/review-manifest.csv): every core group, provisional anchor, dependent counts and missing-field donors.
- [Review manifest, JSON](../../outputs/politician-identity-audit-20261122/review-manifest.json): per-profile evidence, risks, field values and the namesake rejection.
- [Supplemental nickname review](../../outputs/politician-identity-audit-20261122/supplemental-name-review.json) and [cross-state name review](../../outputs/politician-identity-audit-20261122/cross-state-name-review.json).
- [Capture metadata](../../outputs/politician-identity-audit-20261122/capture.json), [analysis summary](../../outputs/politician-identity-audit-20261122/analysis-summary.json), [preservation summary](../../outputs/politician-identity-audit-20261122/preservation-summary.json), [live API schema](../../outputs/politician-identity-audit-20261122/live-schema.json).

The audit scripts are read-only; analysis and manifests are local artifacts. No application migration, production reconciliation, importer run, outbound communication or deployment occurred. The prior homepage shortcut fix remains a separate undeployed change.

This is a complete plan and population-level discovery pass, not a claim that every same-person pair has already been adjudicated. Name changes, incorrect source IDs, missing identity evidence and unknown manual writers remain explicit coverage limits. Implementation should proceed through the phases above; production activation needs the concrete reviewed manifest and deployment authorization required by project rules.
