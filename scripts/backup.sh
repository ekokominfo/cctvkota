#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."
: "${BACKUP_DIR:?Set BACKUP_DIR to protected storage outside checkout}"
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/cctv-$(date -u +%Y%m%dT%H%M%SZ).dump"
# No secrets in command arguments. pg_dump reads existing container environment.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$out.partial"
mv "$out.partial" "$out"
printf '%s\n' "Database backup completed. Copy encrypted off-host and test restore."
