#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_root="${BACKUP_DIR:-${repo_dir}/backups}"
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
destination="${backup_root}/${stamp}"
env_file="${repo_dir}/apps/server/.env"

mkdir -p "${destination}"
docker compose -f "${repo_dir}/docker-compose.yml" --env-file "${env_file}" exec -T postgres \
  sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "${destination}/database.dump"
docker run --rm -v nanahoshi-v2_server_data:/source:ro -v "${destination}:/backup" alpine:3.22 \
  tar -C /source -czf /backup/server-data.tar.gz .
docker compose -f "${repo_dir}/docker-compose.yml" --env-file "${env_file}" exec -T postgres \
  pg_restore --list < "${destination}/database.dump" >/dev/null
printf 'Backup verified: %s\n' "${destination}"
