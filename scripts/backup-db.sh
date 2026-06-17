#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
output="${1:-backup-$(date +%Y%m%d%H%M%S).sql}"

echo "Creating backup to ${output}"
pg_dump "${DATABASE_URL}" > "${output}"
echo "Backup completed: ${output}"
