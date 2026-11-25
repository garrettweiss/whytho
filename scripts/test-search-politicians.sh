#!/bin/sh
# Real local PostgreSQL test for the politician search function and its index-driven plan.
set -eu
PG_BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
ROOT=$(mktemp -d /tmp/whytho-search-db.XXXXXX)
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export LC_ALL=en_US.UTF-8
"$PG_BIN/initdb" -D "$ROOT/data" -U postgres -A trust --no-clean > "$ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$ROOT/data" -l "$ROOT/server.log" -o "-k $ROOT -p 55483 -h ''" start > /dev/null
trap '"$PG_BIN/pg_ctl" -D "$ROOT/data" stop -m fast > /dev/null' EXIT
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$ROOT" -p 55483 -U postgres -d postgres -f "$REPO_ROOT/supabase/tests/search-politicians.sql" > "$ROOT/results.log" 2>&1 || { cat "$ROOT/results.log"; exit 1; }
grep -E "PASS|FAIL" "$ROOT/results.log"
