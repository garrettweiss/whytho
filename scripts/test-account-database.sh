#!/bin/sh
# A fresh local PostgreSQL cluster with synthetic records. Retained for inspection.
set -eu
PG_BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
ACCOUNT_TEST_ROOT=$(mktemp -d /tmp/whytho-account-db.XXXXXX)
ACCOUNT_REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"$PG_BIN/initdb" -D "$ACCOUNT_TEST_ROOT/data" -U postgres -A trust --no-clean > "$ACCOUNT_TEST_ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$ACCOUNT_TEST_ROOT/data" -l "$ACCOUNT_TEST_ROOT/server.log" -o "-k $ACCOUNT_TEST_ROOT -p 55439 -h ''" start > /dev/null
trap '"$PG_BIN/pg_ctl" -D "$ACCOUNT_TEST_ROOT/data" stop -m fast > /dev/null' EXIT
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$ACCOUNT_TEST_ROOT" -p 55439 -U postgres -d postgres -f "$ACCOUNT_REPO_ROOT/supabase/tests/account-personas.sql" > "$ACCOUNT_TEST_ROOT/results.log" 2>&1 || { cat "$ACCOUNT_TEST_ROOT/results.log"; exit 1; }
python3 "$ACCOUNT_REPO_ROOT/scripts/test-account-concurrency.py" "$PG_BIN" "$ACCOUNT_TEST_ROOT" >> "$ACCOUNT_TEST_ROOT/results.log" 2>&1 || { cat "$ACCOUNT_TEST_ROOT/results.log"; exit 1; }
cat "$ACCOUNT_TEST_ROOT/results.log"
printf '\nRetained local test evidence: %s\n' "$ACCOUNT_TEST_ROOT"
