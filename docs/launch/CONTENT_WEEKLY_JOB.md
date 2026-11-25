# Weekly content job and Sunday approval queue

Set up November 25, 2026. Owner: Garrett approves, Esteban runs. Channels: X, Bluesky, Threads.

The job turns the approved copy bank in [SOCIAL_MARKETING_PLAN.md](SOCIAL_MARKETING_PLAN.md) into one reviewable queue per ISO week. Nothing posts without an approval recorded against the item and an explicit go-live run. Herald and Diplomat stay preview-only; this job never mentions, replies to or messages anyone.

## Weekly rhythm

| When | What | Who |
|---|---|---|
| Sunday 14:00 UTC (6 a.m. Pacific) | GitHub Action `Weekly content queue` builds next week's queue on branch `content/queue-<week>` and opens a pull request titled "Content queue <week>: approve this week's posts" (an issue if the token cannot open PRs) | Automatic, once the workflow is on `main` |
| Sunday | Read the review sheet. Reply with the ids to approve, edit any text in the JSON, or skip items | Garrett |
| Sunday night | `content:publish --approve=...` records the approval in the queue file. Posts go out at their scheduled time with `--go-live` | Esteban, on Garrett's "go live" |
| Friday before the status note | `content:weekly --week=<week>` refreshes counts; a changed note returns to draft for re-approval | Esteban |
| Monday | Metrics brief: native platform counts per post, site aggregates separately | Esteban |

Posting slots are Monday, Wednesday and Friday at 16:00 UTC. No posts on US federal holidays listed in `lib/content/assets.ts`. Threads gets Monday and Friday only.

## Commands

```bash
npm run content:weekly -- --week=2026-W48
```

```bash
npm run content:publish -- --week=2026-W48 --approve=2026-W48-01,2026-W48-02 --by=Garrett
```

```bash
npm run content:publish -- --week=2026-W48
```

```bash
npm run content:publish -- --week=2026-W48 --go-live
```

The third command is a dry run and prints the exact text that would post. `--include-future` posts approved items ahead of their slot. `--skip=ID --reason="..."` holds an item.

## Files

- `lib/content/assets.ts`: the copy bank, Garrett's pre-approved pilot posts, launch history and no-post dates. Add or change copy here, never in the queue JSON, so every post traces to reviewed text.
- `lib/content/rules.ts`: per-channel limits (X 280 with links at 23, Bluesky 300 graphemes of the displayed text, Threads 500), no em dashes, no @mentions, banned phrases (ignored, refused, afraid to answer, shame, coward, dodged, hiding), https whytho.us links only, "as of" stamp on status posts.
- `lib/content/queue.ts`: builds and merges the week, assigns stable ids, renders the review sheet.
- `lib/content/publishers/`: X (OAuth 1.0a), Bluesky (AT Protocol, link facets, external card), Threads (container then publish).
- `content/queue/<week>.json` and `.md`: the queue and its review sheet. Statuses: draft, approved, published, skipped, failed.
- `content/published.jsonl`: append-only log of everything posted, with the final text and permalink.

## Credentials

| Channel | Variables | Status |
|---|---|---|
| X | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_WHYTHO_HANDLE` | Set, Read+Write since November 25, 2026 |
| Bluesky | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`, optional `BLUESKY_SERVICE` | Not set. Create the account, then Settings → Privacy and security → App passwords |
| Threads | `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` | Not set. Needs a Meta developer app with the Threads API use case, the WhyTho Threads account added as a tester, and a long-lived token (60 days, refresh with `GET /refresh_access_token`) |

The publisher holds any item whose channel has no credentials and says so. GitHub Actions needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as repository secrets; both are public values already shipped to browsers. The workflow reads only public tables.

## Editorial rules the code enforces

- Every text comes from the copy bank, with only the link, counts and the publish-time "as of" stamp filled in.
- A missing response is stated with a timestamp and never explained or characterised.
- Counts in the status note cover non-test, non-seeded `source=user` questions. The generator cannot separate founder or QA activity, so the review sheet asks Garrett to confirm before approving. Counts older than 24 hours block publication.
- Links are checked for a 200 at generation and again at publish time.
- Approval is refused for any item that fails a rule, and the reason is printed.

## What the job does not do

No paid spend, no mentions, no replies, no DMs, no partner messages, no Instagram or LinkedIn (manual per the plan), no automatic rescheduling of X posts Garrett already queued in the X composer. Check X Unsent posts before approving the December 2 and 4 pilot items so they do not post twice.
