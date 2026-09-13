#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_RESTORE:-}" != nanahoshi ]]; then
  echo 'Refusing restore. Set CONFIRM_RESTORE=nanahoshi after stopping application containers.' >&2
  exit 2
fi
if [[ -z "${RESTORE_FROM:-}" || ! -f "$RESTORE_FROM/database.dump" || ! -f "$RESTORE_FROM/server-data.tar.gz" || ! -f "$RESTORE_FROM/config.env" ]]; then
  echo 'RESTORE_FROM must name a complete backup including config.env.' >&2
  exit 2
fi
install_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${NANAHOSHI_ENV_FILE:-${install_dir}/.env}"
compose() { docker compose -f "${install_dir}/docker-compose.yml" --env-file "$env_file" "$@"; }
[[ -f "$env_file" ]] || { echo 'Restore config.env to the installation .env first.' >&2; exit 2; }
for key in NAMESPACE_UUID DOWNLOAD_SECRET BETTER_AUTH_SECRET DB_PASSWORD REDIS_PASSWORD; do
  saved="$(sed -n "/^${key}=/p" "$RESTORE_FROM/config.env")"
  current="$(sed -n "/^${key}=/p" "$env_file")"
  if [[ -z "$saved" || "$saved" != "$current" ]]; then
    echo "Restore the saved $key configuration before restoring data." >&2
    exit 2
  fi
done
if [[ -n "$(compose ps --status running --services server)" ]]; then
  echo 'Stop the application before restoring.' >&2
  exit 2
fi
container_id="$(compose ps -aq server)"
[[ -n "$container_id" ]] || { echo 'Run docker compose create server first.' >&2; exit 2; }
data_volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/apps/server/data"}}{{.Name}}{{end}}{{end}}' "$container_id")"
[[ -n "$data_volume" ]] || { echo 'Expected a named application data volume.' >&2; exit 2; }
# Validate both archives before changing any data.
compose exec -T postgres pg_restore --list < "$RESTORE_FROM/database.dump" > /dev/null
tar -tzf "$RESTORE_FROM/server-data.tar.gz" > /dev/null
compose exec -T postgres sh -c 'pg_restore --exit-on-error --single-transaction --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$RESTORE_FROM/database.dump"
docker run --rm -i -v "$data_volume:/target" alpine:3.22 \
  sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -C /target -xzf -' < "$RESTORE_FROM/server-data.tar.gz"
# Old queued jobs can refer to rows absent from the restored database.
compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli FLUSHDB' > /dev/null
printf 'Restore completed. Run docker compose up -d, then rescan libraries to rebuild pending work.\n'
