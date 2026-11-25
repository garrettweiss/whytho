# Pilot photos and questions

November 23, 2026. The first pilot uses a common housing topic and four officials from four states. The questions are editable suggestions. A visitor chooses whether to submit one under their own account.

## Repeat before each batch

1. Record each official's stable identifier, canonical WhyTho page, proposed question and precise source claim. Prefer official vote records and enacted text. Record the date, motion and result so a procedural vote is described accurately.
2. Run the source and portrait check for this first batch with `python3 scripts/check-promotion-pilot.py <new-output-directory>`. It uses `Pillow`, `pypdf` and `curl`. It rechecks the roll calls and law, downloads the exact selected files, checks image format and minimum dimensions, and saves SHA-256 fingerprints plus a contact sheet. For a new batch, update the configured source checks and portrait list to match its facts. A failed check holds the item for review.
3. Run `node --import tsx scripts/pilot-question-duplicates.ts` with WhyTho's public Supabase settings available. It checks the public question history across each official's linked profiles. An exact match or a similar premise and ask sends the draft to editorial review. Review related items even when wording differs. Link to a useful existing question if it already asks the same thing.
4. Verify the exact portrait's creator, permission, and credit on its source record. Compare likeness and quality on the contact sheet. Match the asset checksum recorded for that source before reuse. Use a neutral visual if rights, identity, or quality remain unresolved. Store the source, credit, intended use, checksum and any crop in the batch record.
5. Save the cleared asset, approved question, source link, live profile link, and the date checked. Recheck links before the first posts are prepared. Use the portraits in editorial context identifying the official, without implying their endorsement. Keep publishing and outreach as explicit actions.

This is an on-demand check. Running it creates a local evidence package. It does not certify copyright automatically, change profile pictures, submit questions, or publish posts.

## First run

All four source votes and the July 11 enactment date passed. The exact source portraits passed JPEG and dimension checks, and the contact sheet showed clear, recognizable portraits with no obvious defects at pilot display size. The portrait records document federal authorship and public-domain status. The approved copies below are the downloaded source files for limited editorial use in the pilot. The four current WhyTho profile pages resolved to the correct officials. Their mirrored photo records have no source URL or rights basis recorded. Use the exact cleared files above for campaign creative and review any automatically generated post thumbnail before publishing.

| Official | Exact asset | Credit | Source |
|---|---|---|---|
| Robert B. Aderholt, AL-04 | [1,147 × 1,363](evidence/pilot-20261123/A000055.jpg) | US House Office of Photography | [Exact file record](https://commons.wikimedia.org/wiki/File:Robert_Aderholt_official_photo.jpg) |
| Eric Burlison, MO-07 | [3,360 × 4,200](evidence/pilot-20261123/B001316.jpg) | House Creative Services | [Exact file record](https://commons.wikimedia.org/wiki/File:Eric_Burlison_portrait_118th.jpg) |
| Elizabeth Warren, Massachusetts | [1,908 × 2,385](evidence/pilot-20261123/W000817.jpg) | United States Senate | [Exact file record](https://commons.wikimedia.org/wiki/File:Elizabeth_Warren,_official_portrait,_114th_Congress.jpg) |
| Tim Scott, South Carolina | [2,400 × 3,040](evidence/pilot-20261123/S001184.jpg) | U.S. Senate Photographic Studio / Renee Bouchard | [Exact file record](https://commons.wikimedia.org/wiki/File:Tim_Scott,_official_portrait,_113th_Congress.jpg) · [Official press kit](https://www.scott.senate.gov/media-center/presskit/) |

Scott's full-resolution original exceeds WhyTho's 4 MiB profile-upload limit. An eventual profile replacement would need a compliant derivative with the source and credit preserved. That does not affect the source evidence. Public-domain status is assessed file by file. [Federal copyright guidance](https://www.usa.gov/government-copyright)

The [image contact sheet](evidence/pilot-20261123/portrait-review.jpg) and [machine-readable evidence](evidence/pilot-20261123/checks.json) identify the files and sizes. The [live duplicate report](evidence/pilot-20261123/question-duplicates.json) found no exact, near-wording, or same-bill matches among 15 active public questions. The [editorial copy](QUESTION_SUGGESTIONS_FIRST_REVIEW_20261122.md) records the reviewed questions.
