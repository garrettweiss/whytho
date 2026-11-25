# Portrait resolution pass, November 25, 2026

**Outcome: 2,214 live portraits replaced with licensed images at up to 800x1000 over the course of the day: 529 members of Congress, 81 governor profiles, 1,547 state legislators, 29 cabinet and statewide officers, 28 mayors. Nothing was deleted; every prior object and URL is retained and logged.** Zero import errors across seven apply runs. Caches revalidated after each. Garrett reviewed the 37 held members side by side before approving them and approved the position-keyed legislator class.

## Why the photos were grainy

The display box is up to 270 px tall, which is 540 device pixels on a retina screen. The stored files were far smaller:

| Group | Stored before | Cause |
|---|---:|---|
| 405 of 532 members of Congress | 175x219 to 180x225 | Congress.gov member thumbnails were mirrored at thumbnail size |
| 1,849 profiles site-wide | 400x400 | October 2026 storage fix re-encoded every mirrored file to a 400 px square |
| about 4,000 state and local profiles | 125x175 to 250x300 | State legislature sites publish small images |

Browsers upscaled these 1.35x to 4x. The grayscale directory treatment makes the softness more visible but is not the cause.

## What changed in code

- `lib/photos/policy.ts`: stored portraits are now capped at 800x1000 (2x the display box). The upload and import minimum stays 400x500. Sources are never enlarged (`portraitTarget` in `lib/photos/portrait.ts`).
- `lib/photos/rights.ts`: the manifest license list now also accepts CC BY and CC BY-SA 2.0, 2.5 and 3.0, CC0, `US-state-public-record` (California and Florida works), and two held classes that are never imported without a flag: `congress-member-supplied` and `gpo-pictorial-directory`.
- `lib/photos/manifest-sources.ts`: pure helpers that classify Congress.gov attributions, map Commons license metadata to accepted bases, and perform name and district checks. Unit tests in `lib/photos/manifest-sources.test.ts`.
- `scripts/build-federal-photo-manifest.ts`: builds a rights manifest for current members of Congress from the Congress.gov API attribution and the Biographical Directory photo, with the unitedstates/images GPO copy as a held-class fallback.
- `scripts/build-commons-photo-manifest.ts`: builds a rights manifest from Wikimedia Commons. Default key is a stable identifier (Bioguide ID P1157, or a verified X username P2002). `--key=position` instead matches the living current holder of a Wikidata office (Governor of a state, member of a state chamber) by full name, unique on both sides, district-consistent.
- `scripts/photo-pipeline.ts`: `--revalidate` calls the site's admin revalidation route after an apply run.

All builders are read-only and write their manifest, a per-profile report and counts under `docs/launch/evidence/photos/`. Only `photo-pipeline.ts --apply` changes data, and only from a manifest that passes the strict schema.

## Sources and the rights basis recorded per image

| Basis | Count applied | How it is established |
|---|---:|---|
| US federal work (Commons) | 457 members, 24 governor profiles | Commons file carries a `PD US Congress`, `PD USGov` or similar category; artist, source file and category are recorded verbatim |
| US federal work (Congress.gov) | 3 members | Congress.gov API attribution names Senate or House photographic staff; photo from bioguide.congress.gov at 1000x1250 |
| CC BY / CC BY-SA / CC0 | 68 | Commons extmetadata license tag; creator and license URL recorded; credit line shown on the profile |
| State public record | 5 | Commons `PD California` or `PD Florida` category |

Judgement calls, stated plainly:

1. Commons public-domain tagging for official congressional portraits is community review, not a legal opinion. It is the same basis Wikipedia and most newsrooms rely on, and each file's artist and source are recorded so any single image can be challenged and reverted.
2. "Image courtesy of the Member" and GPO Pictorial Directory photos are not treated as federal works. Publication by Congress does not change who took the photo. They are held.
3. Congress.gov's own legal page could not be read by automation (bot check). The federal-work rule relies on usa.gov/government-copyright, which also warns that federal sites may carry third-party material. That warning is why held classes exist.
4. Identity: identifier-keyed matches are exact. Position-keyed matches require state, chamber, first and last name, a living current holder, uniqueness on both sides, and agreeing districts when both sides record one. Duplicate WhyTho profiles of one governor share one match.

## Pass 2 (same day): template-based licenses, mayors, executives

The first pass left 529 legislators and 17 governors whose Commons files were tagged "public domain" without a category the mapper recognised. Reading each file's wikitext showed the actual templates: `PD-NCGov-legislator photo` (94), `PD-GAHoR` (92), `PD-OK-LSBPD` (87), `PD-MAGov` (15), `PD-GAGov` (12), author releases (`PD-author`, `PD-author-FlickrPDM`, `PD-self`, `PDMark-owner`, about 125), federal military templates (`PD-USGov-Military-National Guard` and similar, about 33), and `Copyrighted free use` (72). The mapper now reads templates when metadata alone cannot decide, and accepts those bases as `US-state-public-record`, `public-domain-dedication`, `copyrighted-free-use` or `US-federal-official-duty`. Still refused: `PD-US` (pre-1930 expiry, implausible for a living official), `PD-because`, `GFDL 1.2`, `Copyrighted free use-link`.

Mayors are matched by binding the city (name plus state) first and then its mayoral position; executives by the exact English label of the single-holder office (for example "United States Secretary of the Treasury", "Secretary of State of Colorado"), humans only, living, full name agreeing.

Two pipeline fixes surfaced during the legislator import: 23 legacy rows store an empty string rather than NULL in `photo_url`, so the "unchanged since preview" guard took the wrong branch; and one download threw an empty error. Both were retried successfully after the guard was corrected. The 24 orphaned objects from the first attempts remain in the bucket, unreferenced, per the pipeline's retention rule.

## Coverage after this pass

| Group | Profiles | Replaced today | No licensed source found |
|---|---:|---:|---:|
| Members of Congress | 539 | 529 | 10 (too small everywhere, or label-less Wikidata items) |
| Governor profiles | 98 (about 50 people, duplicates included) | 81 | 17 (13 no Wikidata match, 3 too small, 1 unresolved) |
| State legislators (OpenStates-linked) | 7,117 | 1,547 | 5,570 (5,180 no Wikidata match, 350 too small, 33 unresolved license, 7 other) |
| Cabinet and statewide officers | 45 | 29 | 16 (14 no Wikidata match, 2 too small) |
| Mayors | 50 | 28 | 22 (15 no Wikidata match, 7 too small) |

## State terms research and the operator decision

A same-day check of all 50 legislature websites (`evidence/photos/state-photo-terms-20261125.md`) found only Florida and North Carolina stating a public-domain basis for member photos. California, Oklahoma, Massachusetts and Georgia assert copyright or require permission on their own sites, which contradicts the Commons templates behind 195 of the day's imports. A logged reversal was prepared and dry-run (`scripts/revert-portrait-imports.ts`, `evidence/photos/revert-preview-20261125.json`). **Garrett decided to keep the 195 on the recorded Commons basis.** Each image's basis, template and source remain recorded per profile, so any single image can be reverted later with the same tool.

## What remains and why

1. **5,180 state legislators, 15 mayors, 14 executives, 13 governors with no Wikidata match.** Wikidata has no item for the person, no image on it, or a name that does not agree with ours. There is no licensed bulk source for these. Paths: the verified-office upload flow that already exists; outreach asking offices to upload (outbound, gated by the external-communication rule); or periodic re-runs of the builders, since Wikidata coverage grows.
2. **About 370 too small.** A Commons image exists but is below 400x500. Same paths as above.
3. **33 unresolved licenses.** `PD-US`, `PD-because`, GFDL-only and similar. Deliberately refused.
4. **Duplicate governor profiles.** Covered by the identity deduplication work, not by photos.

Do not upscale. Inventing facial detail for real politicians on an accountability site is not a quality repair.

## Re-running

```bash
npx tsx scripts/build-federal-photo-manifest.ts --concurrency=3
npx tsx scripts/build-commons-photo-manifest.ts --scope=federal --skip-manifest=<previous apply manifest>
npx tsx scripts/build-commons-photo-manifest.ts --key=position --scope=governors --skip-manifest=<previous apply manifest>
npx tsx scripts/photo-pipeline.ts --rights-manifest=<manifest> --dry-run
npx tsx scripts/photo-pipeline.ts --rights-manifest=<manifest> --apply --concurrency=2 --revalidate
```

Evidence: `docs/launch/evidence/photos/` holds every manifest, report, apply log and the held lists; `pass2/` holds the second pass. Storage concurrency stays at 2 per the runbook. Re-running a builder with `--skip-manifest=<every applied manifest>` yields only new matches.
