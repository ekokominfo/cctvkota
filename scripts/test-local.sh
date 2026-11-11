#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Source only your trusted local .env. Test DB is a separate database.
set -a
. ./.env
set +a
export DATABASE_URL="${DATABASE_URL%/cctv}/cctv_test"
export ALLOW_TEST_DATABASE_RESET=1
export LOG_LEVEL=silent
# Already-existing test DB is valid; check rather than ignoring create errors.
exists=$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT 1 FROM pg_database WHERE datname='\''cctv_test'\''"')
if [ "$exists" != 1 ]; then docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" cctv_test'; fi
npm test
