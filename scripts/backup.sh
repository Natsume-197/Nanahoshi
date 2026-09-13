#!/usr/bin/env bash
set -euo pipefail

install_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${NANAHOSHI_ENV_FILE:-${install_dir}/.env}"
compose() { docker compose -f "${install_dir}/docker-compose.yml" --env-file "$env_file" "$@"; }
[[ -f "$env_file" ]] || { echo 'Missing installation .env' >&2; exit 2; }
container_id="$(compose ps -aq server)"
[[ -n "$container_id" ]] || { echo 'Create the application container before backing up.' >&2; exit 2; }
data_volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/apps/server/data"}}{{.Name}}{{end}}{{end}}' "$container_id")"
[[ -n "$data_volume" ]] || { echo 'Expected a named application data volume.' >&2; exit 2; }
umask 077
backup_root="${BACKUP_DIR:-${install_dir}/backups}"
mkdir -p "$backup_root"
destination="$(mktemp -d "$backup_root/$(date -u +%Y-%m-%dT%H%M%SZ).XXXXXX")"
mapfile -t running < <(compose ps --status running --services server)
resume() { if ((${#running[@]})); then compose start "${running[@]}"; fi; }
trap resume EXIT
compose stop server
cp "$env_file" "$destination/config.env"
cp "${install_dir}/docker-compose.yml" "$destination/docker-compose.yml"
compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$destination/database.dump"
docker run --rm -v "$data_volume:/source:ro" alpine:3.22 tar -C /source -czf - . > "$destination/server-data.tar.gz"
compose exec -T postgres pg_restore --list < "$destination/database.dump" > /dev/null
tar -tzf "$destination/server-data.tar.gz" > /dev/null
printf 'Backup created (archive checks passed): %s\nKeep it private; it contains secrets. Back up external books separately.\n' "$destination"
