#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_RESTORE:-}" != "nanahoshi" ]]; then
  printf 'Refusing restore. Set CONFIRM_RESTORE=nanahoshi after stopping application containers.\n' >&2
  exit 2
fi
if [[ -z "${RESTORE_FROM:-}" || ! -f "${RESTORE_FROM}/database.dump" || ! -f "${RESTORE_FROM}/server-data.tar.gz" ]]; then
  printf 'RESTORE_FROM must name a complete Nanahoshi backup directory.\n' >&2
  exit 2
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${repo_dir}/apps/server/.env"
docker compose -f "${repo_dir}/docker-compose.yml" --env-file "${env_file}" exec -T postgres \
  sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "${RESTORE_FROM}/database.dump"
docker run --rm -v nanahoshi-v2_server_data:/target -v "${RESTORE_FROM}:/backup:ro" alpine:3.22 \
  sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -C /target -xzf /backup/server-data.tar.gz'
printf 'Restore completed from %s\n' "${RESTORE_FROM}"
