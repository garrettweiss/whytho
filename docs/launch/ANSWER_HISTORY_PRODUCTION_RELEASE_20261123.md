# Answer history and office preferences production release

November 23, 2026. Garrett authorized the production release and one standard Vercel build on the existing Pro plan.

## Release

- Source commit `339e29cd4ceae55387d03140812eb141a396e79a` fast-forwarded GitHub `main` from `d4c5ce31f4250868e46937b120be41308fa5afde`. The existing politician identity repair and question sort methods are included in that base.
- The [Vercel deployment](https://vercel.com/garrettweiss-projects/whytho/6kp9u4G5osqqzrcC1HNREeNqRrsw) succeeded on the existing production project. The local build used only synthetic staging data.
- Production Supabase scheduled backup available at November 23, 09:56:23 UTC. The earlier independent portrait backup remains recorded in the photo readiness report. No storage writes were part of this release.

## Checks

The exact integrated source passed 186 tests, TypeScript, focused lint, a full build, and eight browser checks against synthetic hosted staging. Evidence is in `diagnostics/staging-acceptance-20261123/integrated-production-candidate/`.

Supabase recorded all three reviewed migrations, in order. All four new tables have row-level security. The public API recognized the correction relationship. Anonymous users cannot read office preferences or invoke the privileged correction function. Questions, answers, votes, and identity-link counts matched the preflight, and the event ledger contained no historical backfill. Office preference changes do not send email.

- `20261119000100_question_notification_events.sql`
- `20261122000100_politician_notification_preferences.sql`
- `20261122000200_answer_corrections.sql`

GitHub CI and Vercel returned success for the exact release commit. All nine read-only live checks passed, covering health, home, leaderboard, races, the profile sorting options, the prior profile alias, the office email endpoint's sign-in requirement, and the dashboard's sign-in redirect. The dashboard uses a streamed redirect in an HTTP 200 response. Evidence is in `diagnostics/staging-acceptance-20261123/integrated-production-candidate/live-smoke.json`.

The original-and-correction display was exercised using synthetic staging answers. Production had zero answer rows at preflight, and the live smoke checks did not create any. No politician email, delivery worker, or sending schedule was activated.
