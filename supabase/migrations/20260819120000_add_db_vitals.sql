-- get_db_vitals()
--
-- Exposes the diagnostic signals PostgREST cannot otherwise reach, so the
-- /api/health endpoint can ship them to PostHog on every uptime ping.
--
-- Motivation: during the August 2026 outage the instance ran at 100% compute and
-- 100% disk IO for roughly a week, and the restart that recovered it also reset
-- every Postgres statistic. Root cause could not be determined afterwards. These
-- vitals are recorded externally and continuously so the next incident leaves a
-- trail that survives the restart.
--
-- SECURITY DEFINER is required to read cluster-level views. Execute is granted
-- to service_role only, never to anon or authenticated.

create or replace function public.get_db_vitals()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_wal_bytes bigint := null;
  v_slot_lag bigint := null;
  v_cron_failures int := null;
  v_cron_longest numeric := null;
begin
  -- WAL size. Grew to 96 MB against a 47 MB database during the incident, so it
  -- is worth trending.
  begin
    select coalesce(sum(size), 0) into v_wal_bytes from pg_ls_waldir();
  exception when others then
    v_wal_bytes := null;
  end;

  -- Replication slot lag. An inactive slot retains WAL without bound.
  begin
    select coalesce(max(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)), 0)
      into v_slot_lag
      from pg_replication_slots;
  exception when others then
    v_slot_lag := null;
  end;

  -- pg_cron history survives restarts, unlike pg_stat_*, which makes it one of
  -- the few durable forensic sources available.
  begin
    select count(*) filter (where status <> 'succeeded'),
           max(extract(epoch from (coalesce(end_time, now()) - start_time)))
      into v_cron_failures, v_cron_longest
      from cron.job_run_details
     where start_time > now() - interval '1 hour';
  exception when others then
    v_cron_failures := null;
    v_cron_longest := null;
  end;

  select jsonb_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'wal_size_bytes', v_wal_bytes,
    'replication_slot_max_lag_bytes', v_slot_lag,
    'active_connections', (
      select count(*) from pg_stat_activity where datname = current_database()
    ),
    'active_queries', (
      select count(*) from pg_stat_activity
       where datname = current_database() and state = 'active'
    ),
    'longest_query_seconds', (
      select coalesce(max(extract(epoch from (now() - query_start))), 0)::int
        from pg_stat_activity
       where datname = current_database()
         and state = 'active'
         and query not ilike '%get_db_vitals%'
    ),
    'idle_in_transaction', (
      select count(*) from pg_stat_activity
       where datname = current_database() and state = 'idle in transaction'
    ),
    'cron_failures_last_hour', v_cron_failures,
    'cron_longest_run_seconds_last_hour', v_cron_longest,
    'stats_reset_at', (
      select stats_reset from pg_stat_database where datname = current_database()
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_db_vitals() from public, anon, authenticated;
grant execute on function public.get_db_vitals() to service_role;

comment on function public.get_db_vitals() is
  'Diagnostic vitals for /api/health. Service role only. See RUNBOOK.md.';
