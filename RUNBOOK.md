# WhyTho Incident Runbook

Operational procedures for the production database and site.
Written after the August 2026 outage. Read the first section before touching anything.

---

## Rule 1: Capture before you restart

**Postgres statistics reset on restart.** `pg_stat_activity`, `pg_stat_statements`,
table stats, index stats and cache-hit ratios are all destroyed the moment the
instance comes back.

In August 2026 the database was restarted to recover service. It worked, and it
also erased every trace of what had pinned the instance at 100% compute and 100%
disk IO for the preceding week. **The root cause was never established.**

So, before any restart, resize, or failover:

```bash
npx tsx scripts/db-diagnostics.ts
```

This writes a timestamped snapshot to `diagnostics/`. It takes under a minute and
needs no database password, only a logged-in linked Supabase CLI. If the database
is completely unreachable the script still records what it can, which is itself
evidence.

Only after that file exists should you restart.

The one thing that does survive a restart is `cron.job_run_details`, plus the
compute and disk charts in the Supabase dashboard. Check both.

---

## Detecting an incident

### The health endpoint

`GET /api/health` asserts on truth, not reachability:

| Check | Fails when |
|---|---|
| `politicians_present` | active politician count is 0 |
| `questions_present` | question count is 0 |
| `rpc_current_week` | stored functions do not execute |

Returns **200** when healthy, **503** when any assertion fails. A response slower
than 2s is reported as `degraded` while still returning 200.

```bash
curl -s https://whytho.us/api/health | jq
```

### Why a plain status check is not enough

During the outage the site returned **HTTP 200** on every page while rendering
"0 politicians tracked", because failed queries degraded silently to empty state.
UptimeRobot recorded **100.000% uptime** throughout.

The uptime monitor must therefore:

1. Point at `/api/health`, not `/`
2. Alert on non-200 **and** on the keyword `"ok":true` being absent
3. Have an alert contact that actually reaches a human

### Trend data

`/api/health` ships vitals to PostHog as `db_health_check` on every call. Since
the uptime monitor calls it every 5 minutes, that is a continuous external time
series. It is stored outside the database on purpose: metrics kept inside the
database are unreadable exactly when you need them.

Look for `wal_size_bytes` climbing, `active_connections` stacking, or
`longest_query_seconds` growing in the hours before an incident.

---

## Triage: site is down or slow

1. **Capture diagnostics.** `npx tsx scripts/db-diagnostics.ts`
2. **Check health.** `curl -s https://whytho.us/api/health | jq`
3. **Classify the failure:**

| Symptom | Likely layer |
|---|---|
| 522 or 521 from `*.supabase.co` | Database or API gateway |
| `/api/health` 503, site loads | Database degraded, app healthy |
| Site slow but health 200 | Caching or cold start |
| 500 with Sentry events | Application code |

4. **Check the Supabase dashboard** for compute and disk IO. These charts survive
   restarts and show history the database itself no longer has.
5. **Check cron**, which also survives restarts:

```sql
select jobid, jobname, schedule, active from cron.job order by jobid;

select jobname, status, start_time, end_time,
       end_time - start_time as duration, return_message
from cron.job_run_details
order by start_time desc limit 40;
```

6. **Only now**, restart: Supabase dashboard, Settings, General, Restart project.

---

## Caching rules for public pages

Root cause of the August 2026 outage, confirmed by Supabase on 30 August and
16 September: **Disk IO budget exhaustion on the nano instance**, driven by every
public page running its full query set on every request with no cache. Vercel
measured the crawler baseline at roughly 24,000 invocations a day, and a 20x
spike on 2 September. Each invocation was ~8 database queries.

Two things force a Next.js page to render on every request, defeating ISR:

1. Reading cookies or headers. `createClient()` in `lib/supabase/server.ts`
   reads cookies, so **never call it from a public page**. Use
   `createPublicClient()` (anon key, no session, same RLS as a logged-out
   visitor). Anything that needs the current user goes in a client component,
   see `components/politician/owner-banner.tsx` and `lib/auth/use-owner-membership.ts`.
2. Reading `searchParams`. Pages that need query params (`/[slug]`, `/federal`,
   `/races`) stay dynamic, so their **data layer** is cached instead with
   `unstable_cache`, keyed by the params that shape the query.

| Page | Strategy | Window |
|---|---|---|
| `/` | ISR | 15 min |
| `/leaderboard` | ISR | 1 h |
| `/state/[code]`, `/region/[state]` | ISR | 1 h |
| `/races/[slug]` | ISR | 1 h |
| `/[slug]` | data cache per (slug, week, period) | 5 min |
| `/federal` | data cache, single key | 1 h |
| `/races` | data cache per (filter, state) | 1 h |

Consequences to know about: a politician's new answer takes up to 5 minutes to
appear on their public profile. Votes still update live for the voter through
optimistic UI and Broadcast. Test fixtures (`is_test = true`) are excluded from
every listing, search index and the sitemap, and their profiles carry
`noindex`, but remain reachable by direct URL so the team can QA them.

Verify caching is working after any deploy:

```bash
curl -sI https://whytho.us/ | grep -iE "x-vercel-cache|cache-control"
```

Expect `x-vercel-cache: HIT` (or `STALE`) on the second request and a
`cache-control` with `s-maxage`. `no-store` plus `MISS` on every request means
something has reintroduced a dynamic API into that page.

---

## Known incident: August 2026

**Symptoms.** Every page returned HTTP 200 in roughly 40 seconds while rendering
zeros. Supabase REST returned 522 on every request. Compute and disk IO were
pinned at 100% from at least Aug 12. Uptime monitoring reported 100% availability
for the entire period.

**Contributing factor.** Every public page uses the cookie-reading Supabase server
client, which forces dynamic rendering and silently voids the `revalidate` exports.
The homepage runs one RPC plus seven parallel queries per request with no CDN
cache, against 11,513 politicians and 24,646 questions on a `t4g.nano` instance.

**Not the cause.** Database size was 47 MB against a 500 MB limit, so disk space
was not implicated. No orphaned replication slot. No long-running queries.

**Resolved (18 September 2026).** Supabase named it in two emails: Disk IO
budget exhaustion. The "3 per minute" figure measured only requests that reached
Supabase's API gateway during the outage; Vercel's own numbers put the crawler
baseline at ~257 invocations per 15 minutes, each running ~8 uncached queries.
See "Caching rules for public pages" above. The restart still destroyed the
Postgres-side evidence, and the capture-before-restart rule stands.

---

## Backups

The free plan includes **no backups**. Until the project is on Pro with daily
backups and point-in-time recovery, take a manual snapshot before any risky change:

```bash
supabase db dump --linked -f backup-schema.sql
supabase db dump --linked --role-only -f backup-roles.sql
```

Row data exports via the REST API with the service-role key. The August 2026
snapshot lives at `~/whytho-backup-2026-08-19/`, deliberately outside the git
repository because several tables contain user PII.

Requires Docker running (`colima start`) for the schema dump.

---

## Schema in version control

As of August 2026 the remote database reported **29 applied migrations, none of
which existed as local files**. They were applied directly to production and the
SQL was never committed, so the schema was not reproducible from the repository.

`supabase/schema-baseline-2026-08-19.sql` is a full DDL snapshot taken at that
point: 24 tables, 42 RLS policies, 12 functions, 45 indexes. It is a reference
baseline, deliberately not placed in `migrations/` so the CLI does not try to
replay it.

From here, every schema change should be a file in `supabase/migrations/` applied
with `supabase db push`, never applied straight to production.

Refresh the baseline with:

```bash
supabase db dump --linked -f supabase/schema-baseline-$(date +%Y-%m-%d).sql
```

---

## Applying the vitals migration

`get_db_vitals()` is defined in `supabase/migrations/20260819120000_add_db_vitals.sql`.
`/api/health` degrades gracefully if it is absent, reporting `vitals: null`.

Apply with `supabase db push`, or paste the file contents into the dashboard SQL
editor. It is additive: it creates one function and grants execute to
`service_role` only.
