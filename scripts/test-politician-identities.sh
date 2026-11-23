#!/bin/sh
# Real local PostgreSQL tests. Cluster and logs retained, no production access.
set -eu
PG_BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
IDENTITY_TEST_ROOT=$(mktemp -d /tmp/whytho-identity-db.XXXXXX)
IDENTITY_REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"$PG_BIN/initdb" -D "$IDENTITY_TEST_ROOT/data" -U postgres -A trust --no-clean > "$IDENTITY_TEST_ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$IDENTITY_TEST_ROOT/data" -l "$IDENTITY_TEST_ROOT/server.log" -o "-k $IDENTITY_TEST_ROOT -p 55479 -h ''" start > /dev/null
if [ "${KEEP_IDENTITY_DB:-0}" != 1 ]; then
 trap '"$PG_BIN/pg_ctl" -D "$IDENTITY_TEST_ROOT/data" stop -m fast > /dev/null' EXIT
fi
if [ -f "$IDENTITY_REPO_ROOT/supabase/migrations/20261119000100_question_notification_events.sql" ] && [ "${IDENTITY_LIVE_BASE_ONLY:-0}" != 1 ]; then
 "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$IDENTITY_TEST_ROOT" -p 55479 -U postgres -d postgres -f "$IDENTITY_REPO_ROOT/supabase/tests/politician-identities.sql" > "$IDENTITY_TEST_ROOT/results.log" 2>&1 || { cat "$IDENTITY_TEST_ROOT/results.log"; exit 1; }
 python3 "$IDENTITY_REPO_ROOT/scripts/test-politician-identity-concurrency.py" "$PG_BIN" "$IDENTITY_TEST_ROOT" >> "$IDENTITY_TEST_ROOT/results.log" 2>&1 || { cat "$IDENTITY_TEST_ROOT/results.log"; exit 1; }
 "$PG_BIN/createdb" -h "$IDENTITY_TEST_ROOT" -p 55479 -U postgres identity_live_base
 IDENTITY_BASE_DATABASE=identity_live_base
else
 IDENTITY_BASE_DATABASE=postgres
fi
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$IDENTITY_TEST_ROOT" -p 55479 -U postgres -d "$IDENTITY_BASE_DATABASE" -f "$IDENTITY_REPO_ROOT/supabase/tests/politician-identities-live-base.sql" >> "$IDENTITY_TEST_ROOT/results.log" 2>&1 || { cat "$IDENTITY_TEST_ROOT/results.log"; exit 1; }
cat "$IDENTITY_TEST_ROOT/results.log"
printf '\nRetained local test evidence: %s\n' "$IDENTITY_TEST_ROOT"
