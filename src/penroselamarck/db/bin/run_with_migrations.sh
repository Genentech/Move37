#!/bin/sh
set -e
# Locate original postgres entrypoint (official image path)
ORIG_ENTRYPOINT="/usr/local/bin/docker-entrypoint.sh"
if [ ! -x "$ORIG_ENTRYPOINT" ]; then
    echo "[wrapper] Original entrypoint not found at $ORIG_ENTRYPOINT" >&2
    exit 1
fi

# Start postgres in background using original entrypoint
"$ORIG_ENTRYPOINT" postgres &
PG_PID=$!
# Wait for postgres to accept connections
echo "[wrapper] Waiting for Postgres to become available..."
RETRIES=60
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" -h 127.0.0.1 -p 5432 > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        echo "[wrapper] Postgres did not become ready in time" >&2
        exit 1
    fi
    sleep 1
done

# Apply migrations
export POSTGRES_HOST="127.0.0.1"
export POSTGRES_PORT="5432"
export PYTHONPATH=/app

echo "[wrapper] Postgres is ready, applying migrations..."
alembic -c /app/alembic.ini upgrade head || {
    echo "[wrapper] Migration failed" >&2
    kill $PG_PID
    exit 1
}

is_truthy() {
    value=$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')
    [ "$value" = "1" ] || [ "$value" = "true" ] || [ "$value" = "yes" ] || [ "$value" = "on" ]
}

if is_truthy "${DB_MOCK_DATA:-false}"; then
    echo "[wrapper] DB_MOCK_DATA=true, running deterministic seed module..."
    python3 -m penroselamarck.db.bin.seed || {
        echo "[wrapper] Seed failed" >&2
        kill $PG_PID
        exit 1
    }
else
    echo "[wrapper] DB_MOCK_DATA=false, skipping deterministic seed module."
fi

# Attach to Postgres foreground
echo "[wrapper] Migrations complete. Attaching to Postgres foreground..."
wait $PG_PID
