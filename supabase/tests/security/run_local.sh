#!/bin/bash
set -euo pipefail
# Local-only, socket-only PostgreSQL. Never accepts a production database URL.
# Scratch files are retained for inspection; no deletion or cleanup of user data.
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
pg_bin="${WHYTHO_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
case_dir="$(mktemp -d /tmp/wt-rls.XXXXXX)"
export LC_ALL=C
"$pg_bin/initdb" -D "$case_dir/data" -U postgres -A trust --no-locale -E UTF8 > "$case_dir/initdb.log"
stop_cluster() { "$pg_bin/pg_ctl" -D "$case_dir/data" -m fast stop > "$case_dir/stop.log" 2>&1 || true; }
trap stop_cluster EXIT
"$pg_bin/pg_ctl" -D "$case_dir/data" -l "$case_dir/postgres.log" -o "-k $case_dir -p 55439 -c listen_addresses=''" -w start
run_sql() { "$pg_bin/psql" -X -h "$case_dir" -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$1"; }
run_sql "$repo_root/supabase/tests/security/scaffold.sql"
# Drift tests change only the disposable fixture, inside transactions that abort.
# A failed psql connection rolls back its entire transaction automatically.
for drift in policy columns; do
  if [ "$drift" = policy ]; then
    drift_sql='ALTER POLICY answers_public_read ON public.answers USING (false);'
  else
    drift_sql='GRANT UPDATE (net_upvotes) ON public.questions TO authenticated;'
  fi
  if "$pg_bin/psql" -X -h "$case_dir" -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 > "$case_dir/$drift-preflight.log" 2>&1 <<SQL
BEGIN;
$drift_sql
\i '$repo_root/supabase/migrations/20261031041730_release_rls_hardening.sql'
ROLLBACK;
SQL
  then
    printf 'FAIL: %s drift was accepted\n' "$drift" >&2
    exit 1
  fi
  if ! grep -q 'Release preflight:' "$case_dir/$drift-preflight.log"; then
    cat "$case_dir/$drift-preflight.log" >&2
    exit 1
  fi
  printf 'PASS: %s drift rejected before migration\n' "$drift"
done
run_sql "$repo_root/supabase/tests/security/policy_fingerprints.sql"
run_sql "$repo_root/supabase/migrations/20261031041730_release_rls_hardening.sql"
run_sql "$repo_root/supabase/tests/security/release_rls.test.sql"
run_sql "$repo_root/supabase/tests/security/postapply.sql"
run_sql "$repo_root/supabase/tests/security/policy_fingerprints.sql"
# Re-apply to prove idempotency before testing the emergency rollback.
run_sql "$repo_root/supabase/migrations/20261031041730_release_rls_hardening.sql"
run_sql "$repo_root/supabase/rollbacks/20261031041730_release_rls_hardening.rollback.sql"
run_sql "$repo_root/supabase/tests/security/rollback.test.sql"
run_sql "$repo_root/supabase/tests/security/policy_fingerprints.sql"
# Leave the local database hardened and prove forward reapplication after rollback.
run_sql "$repo_root/supabase/migrations/20261031041730_release_rls_hardening.sql"
run_sql "$repo_root/supabase/tests/security/release_rls.test.sql"
run_sql "$repo_root/supabase/tests/security/postapply.sql"
run_sql "$repo_root/supabase/tests/security/policy_fingerprints.sql"
printf 'PASS: policy tests, repeat apply, rollback, and forward reapply. Scratch retained at %s\n' "$case_dir"
