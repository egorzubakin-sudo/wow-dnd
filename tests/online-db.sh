#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container=$(docker run --rm -d -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine -c wal_level=logical)
trap 'docker stop "$container" >/dev/null' EXIT
for attempt in {1..40}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.5
done
for sql in tests/online-db-fixture.sql supabase/migrations/202611270001_atlas_online.sql tests/online-db-check.sql; do
  docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres < "$sql"
done
