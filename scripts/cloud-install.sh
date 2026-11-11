#!/bin/sh
# Managed-cloud development only; never use this helper on production.
set -eu
cd /workspace/cctvkota
export npm_config_cache=/workspace/.npm-cache
npm ci --no-audit --no-fund
if [ ! -f .env ]; then node scripts/init-local.mjs; fi
set -a
. ./.env
set +a
node --input-type=module -e '
const u=new URL(process.env.DATABASE_URL);
if(u.hostname!=="127.0.0.1" || u.pathname!=="/cctv" || process.env.NODE_ENV!=="development" || process.env.APP_ORIGIN!=="http://localhost:3000") {
 console.error("Refusing non-local development configuration"); process.exit(1);
}'
# Use only the local managed daemon, never an inherited remote Docker context.
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock compose -f compose.yml -f compose.dev.yml --profile demo up -d --wait db mediamtx dummy
npm run db:migrate
./node_modules/.bin/tsx apps/api/src/demo.ts
