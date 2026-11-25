# Portrait resolution pass, November 25, 2026

**Outcome: 557 live portraits replaced with licensed images at up to 800x1000 (492 members of Congress, 65 governor profiles). Nothing was deleted; every prior object and URL is retained and logged.** Zero import errors. Caches revalidated. A further 1,051 state legislators and 37 members of Congress have ready manifests that wait on an operator decision.

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

## Coverage after this pass

| Group | Profiles | Replaced today | Ready, held for decision | No licensed source found |
|---|---:|---:|---:|---:|
| Members of Congress | 539 | 492 | 37 (`federal-held-remaining-20261125.json`: 22 GPO directory, 15 member-supplied) | 10 (too small everywhere, or label-less Wikidata items) |
| Governor profiles | 98 (about 50 people, duplicates included) | 65 | 0 | 33 (13 no Wikidata match, 17 unresolved public-domain claims, 3 too small) |
| State legislators (OpenStates-linked) | 7,117 | 0 | 1,051 (`commons-manifest-legislators-position-20261125.json`) | 6,066 (5,180 no Wikidata match, 529 unresolved license, 350 too small, 7 other) |
| Mayors, cabinet, statewide officers | about 110 | 0 | 0 | not attempted |

## Solutions for the remaining photos

1. **Members of Congress, 37 held.** One decision: whether a portrait the Member's office supplied to Congress for public distribution is an acceptable basis for WhyTho. If yes, run `photo-pipeline.ts --rights-manifest=docs/launch/evidence/photos/federal-held-remaining-20261125.json --apply --concurrency=2 --revalidate`. If no, they keep the placeholder path (verified office upload).
2. **State legislators, 1,051 ready.** One decision: whether the position-keyed match (office, state, full name, living current holder, unique, district-consistent) is an acceptable identity check. It is structured, not name-only, but it is still name-based. If yes, apply the manifest; spot-check a sample first. Expected false-match rate is low but not zero; every import is versioned and reversible per profile.
3. **State legislators, 529 unresolved licenses.** 434 are Commons "public domain" files without a recognised category (mostly state legislature templates and author self-releases). Extending `commonsLicense` with per-state public-record templates and `PD-self` would recover a large share. This is a rules change, not a new source.
4. **State legislators, 5,180 with no Wikidata match.** Wikidata has no item or no image. The only lawful upgrade paths are the verified-office upload flow that already exists, or outreach asking offices to upload (outbound, gated by the external-communication rule). Their current small image or the initials placeholder remains.
5. **Governors, 33.** Mostly duplicate profiles whose canonical twin was covered, plus unresolved public-domain claims. Covered by item 3 and by identity deduplication.
6. **Mayors and cabinet, about 110.** Small enough for the position-keyed builder once mayor and cabinet positions are added to its chamber map, or for manual upload.

Do not upscale. Inventing facial detail for real politicians on an accountability site is not a quality repair.

## Re-running

```bash
npx tsx scripts/build-federal-photo-manifest.ts --concurrency=3
npx tsx scripts/build-commons-photo-manifest.ts --scope=federal --skip-manifest=<previous apply manifest>
npx tsx scripts/build-commons-photo-manifest.ts --key=position --scope=governors --skip-manifest=<previous apply manifest>
npx tsx scripts/photo-pipeline.ts --rights-manifest=<manifest> --dry-run
npx tsx scripts/photo-pipeline.ts --rights-manifest=<manifest> --apply --concurrency=2 --revalidate
```

Evidence: `docs/launch/evidence/photos/` holds every manifest, report, apply log and the held lists. Storage concurrency stays at 2 per the runbook.
