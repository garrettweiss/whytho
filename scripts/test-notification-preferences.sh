#!/bin/sh
# Socket-only synthetic local cluster; files are retained for inspection.
set -eu
PG_BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
PREFERENCE_TEST_ROOT=$(mktemp -d /tmp/whytho-notification-preferences.XXXXXX)
PREFERENCE_REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"$PG_BIN/initdb" -D "$PREFERENCE_TEST_ROOT/data" -U postgres -A trust --no-clean > "$PREFERENCE_TEST_ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$PREFERENCE_TEST_ROOT/data" -l "$PREFERENCE_TEST_ROOT/server.log" -o "-k $PREFERENCE_TEST_ROOT -p 55459 -h ''" start > /dev/null
trap '"$PG_BIN/pg_ctl" -D "$PREFERENCE_TEST_ROOT/data" stop -m fast > /dev/null' EXIT
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$PREFERENCE_TEST_ROOT" -p 55459 -U postgres -d postgres -f "$PREFERENCE_REPO_ROOT/supabase/tests/notification-preferences.sql" > "$PREFERENCE_TEST_ROOT/results.log" 2>&1 || { cat "$PREFERENCE_TEST_ROOT/results.log"; exit 1; }
cat "$PREFERENCE_TEST_ROOT/results.log"
printf '\nRetained preference test evidence: %s\n' "$PREFERENCE_TEST_ROOT"
