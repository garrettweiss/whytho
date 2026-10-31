#!/bin/bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${WHYTHO_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
case_dir="$(mktemp -d /tmp/wt-launch-security.XXXXXX)"
export LC_ALL=C
"$pg_bin/initdb" -D "$case_dir/data" -U postgres -A trust --no-clean --no-locale -E UTF8 > "$case_dir/initdb.log"
trap '"$pg_bin/pg_ctl" -D "$case_dir/data" -m fast stop > "$case_dir/stop.log" 2>&1 || true' EXIT
"$pg_bin/pg_ctl" -D "$case_dir/data" -l "$case_dir/postgres.log" -o "-k $case_dir -p 55441 -c listen_addresses=''" -w start > "$case_dir/start.log"
"$pg_bin/psql" -X -h "$case_dir" -p 55441 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$repo_root/supabase/tests/security/launch_security.test.sql" > "$case_dir/results.log" 2>&1 || { cat "$case_dir/results.log"; exit 1; }
python3 "$repo_root/scripts/test-security-concurrency.py" "$pg_bin" "$case_dir" >> "$case_dir/results.log" 2>&1 || { cat "$case_dir/results.log"; exit 1; }
cat "$case_dir/results.log"
printf 'PASS: security migration tested and repeated; scratch retained at %s\n' "$case_dir"
