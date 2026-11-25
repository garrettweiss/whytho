#!/bin/sh
# Synthetic local-only cluster, retained. No production connection or email provider.
set -eu
PG_BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
NOTIFICATION_TEST_ROOT=$(mktemp -d /tmp/whytho-notification-db.XXXXXX)
NOTIFICATION_REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"$PG_BIN/initdb" -D "$NOTIFICATION_TEST_ROOT/data" -U postgres -A trust --no-clean > "$NOTIFICATION_TEST_ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$NOTIFICATION_TEST_ROOT/data" -l "$NOTIFICATION_TEST_ROOT/server.log" -o "-k $NOTIFICATION_TEST_ROOT -p 55449 -h ''" start > /dev/null
trap '"$PG_BIN/pg_ctl" -D "$NOTIFICATION_TEST_ROOT/data" stop -m fast > /dev/null' EXIT
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$NOTIFICATION_TEST_ROOT" -p 55449 -U postgres -d postgres -f "$NOTIFICATION_REPO_ROOT/supabase/tests/notification-events.sql" > "$NOTIFICATION_TEST_ROOT/results.log" 2>&1 || { cat "$NOTIFICATION_TEST_ROOT/results.log"; exit 1; }
cat "$NOTIFICATION_TEST_ROOT/results.log"
python3 "$NOTIFICATION_REPO_ROOT/scripts/test-notification-event-concurrency.py" "$PG_BIN" "$NOTIFICATION_TEST_ROOT"
printf '\nRetained notification test evidence: %s\n' "$NOTIFICATION_TEST_ROOT"
