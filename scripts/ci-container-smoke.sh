#!/usr/bin/env bash
set -euo pipefail

readonly COMPOSE_FILE="docker-compose.ci.yml"
readonly DIAGNOSTICS_DIR="${CONTAINER_SMOKE_DIAGNOSTICS_DIR:-${RUNNER_TEMP:-/tmp}/nanahoshi-container-smoke}"
readonly PROJECT_FILE="${DIAGNOSTICS_DIR}/project-name.txt"

random_hex() {
	openssl rand -hex "$1"
}

generate_uuid() {
	local value
	value="$(random_hex 16)"
	printf '%s-%s-%s-%s-%s\n' \
		"${value:0:8}" "${value:8:4}" "4${value:13:3}" \
		"8${value:17:3}" "${value:20:12}"
}

mask_secret() {
	if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
		printf '::add-mask::%s\n' "$1"
	fi
}

set_cleanup_defaults() {
	export CI_API_PORT="${CI_API_PORT:-0}"
	export CI_WEB_PORT="${CI_WEB_PORT:-0}"
	export NAMESPACE_UUID="${NAMESPACE_UUID:-00000000-0000-4000-8000-000000000000}"
	export DOWNLOAD_SECRET="${DOWNLOAD_SECRET:-00000000-0000-4000-8000-000000000001}"
	export DB_USER="${DB_USER:-ci}"
	export DB_PASSWORD="${DB_PASSWORD:-cleanup-only}"
	export DB_NAME="${DB_NAME:-nanahoshi_ci}"
	export REDIS_PASSWORD="${REDIS_PASSWORD:-cleanup-only}"
	export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-cleanup-only-secret-with-32-characters}"
}

compose() {
	docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

cleanup_only() {
	if [[ ! -f "$PROJECT_FILE" ]]; then
		echo "Container smoke cleanup: no recorded project"
		return 0
	fi
	COMPOSE_PROJECT_NAME="$(<"$PROJECT_FILE")"
	export COMPOSE_PROJECT_NAME
	set_cleanup_defaults
	compose down --volumes --remove-orphans
	echo "Container smoke cleanup: complete"
}

if [[ "${1:-}" == "cleanup" ]]; then
	cleanup_only
	exit 0
fi

mkdir -p "$DIAGNOSTICS_DIR"
rm -f "${DIAGNOSTICS_DIR}/compose-ps.json" \
	"${DIAGNOSTICS_DIR}/failure-logs.txt" "${DIAGNOSTICS_DIR}/summary.txt"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-nanahoshi-ci-$(random_hex 6)}"
export COMPOSE_PROJECT_NAME
printf '%s\n' "$COMPOSE_PROJECT_NAME" >"$PROJECT_FILE"

export CI_API_PORT="${CI_API_PORT:-0}"
export CI_WEB_PORT="${CI_WEB_PORT:-0}"
export NAMESPACE_UUID="$(generate_uuid)"
export DOWNLOAD_SECRET="$(generate_uuid)"
export DB_USER="ci_$(random_hex 4)"
export DB_PASSWORD="$(random_hex 24)"
export DB_NAME="nanahoshi_ci_$(random_hex 4)"
export REDIS_PASSWORD="$(random_hex 24)"
export BETTER_AUTH_SECRET="$(random_hex 32)"

for secret in \
	"$NAMESPACE_UUID" "$DOWNLOAD_SECRET" "$DB_USER" "$DB_PASSWORD" \
	"$DB_NAME" "$REDIS_PASSWORD" "$BETTER_AUTH_SECRET"; do
	mask_secret "$secret"
done

sanitize() {
	sed \
		-e "s/${NAMESPACE_UUID}/[REDACTED]/g" \
		-e "s/${DOWNLOAD_SECRET}/[REDACTED]/g" \
		-e "s/${DB_USER}/[REDACTED]/g" \
		-e "s/${DB_PASSWORD}/[REDACTED]/g" \
		-e "s/${DB_NAME}/[REDACTED]/g" \
		-e "s/${REDIS_PASSWORD}/[REDACTED]/g" \
		-e "s/${BETTER_AUTH_SECRET}/[REDACTED]/g"
}

capture_diagnostics() {
	compose ps -a --format json 2>&1 | sanitize >"${DIAGNOSTICS_DIR}/compose-ps.json" || true
	if (( $1 != 0 )); then
		compose logs --no-color --tail 200 2>&1 | sanitize >"${DIAGNOSTICS_DIR}/failure-logs.txt" || true
	fi
}

finish() {
	local status=$?
	trap - EXIT INT TERM
	set +e
	capture_diagnostics "$status"
	compose down --volumes --remove-orphans >/dev/null 2>&1
	local cleanup_status=$?
	if (( cleanup_status != 0 )); then
		echo "Container smoke cleanup: failed" >&2
		(( status == 0 )) && status=$cleanup_status
	else
		echo "Container smoke cleanup: complete"
	fi
	exit "$status"
}
trap finish EXIT
trap 'exit 130' INT TERM

compose config --quiet
compose up -d --wait --wait-timeout 120

api_port="$(compose port server 3000 | tail -n 1 | sed 's/.*://')"
web_port="$(compose port web 3000 | tail -n 1 | sed 's/.*://')"

api_body="$(curl --fail --silent --show-error --max-time 10 \
	--write-out $'\n%{http_code}' "http://127.0.0.1:${api_port}/")"
api_status="${api_body##*$'\n'}"
api_body="${api_body%$'\n'*}"
if [[ "$api_status" != "200" || "$api_body" != "OK" ]]; then
	echo "Container smoke: API root did not return HTTP 200 with exact body OK" >&2
	exit 1
fi

web_status="$(curl --location --max-redirs 5 --silent --show-error \
	--output /dev/null --max-time 15 --write-out '%{http_code}' \
	"http://127.0.0.1:${web_port}/")"
if [[ ! "$web_status" =~ ^[23][0-9][0-9]$ ]]; then
	echo "Container smoke: web anonymous flow returned unexpected HTTP ${web_status}" >&2
	exit 1
fi

deadline=$((SECONDS + 120))
until compose logs --no-color worker 2>&1 | grep -Fq "Worker process ready"; do
	if (( SECONDS >= deadline )); then
		echo "Container smoke: worker readiness deadline exceeded" >&2
		exit 1
	fi
	if [[ "$(compose ps --status running -q worker | wc -l)" -ne 1 ]]; then
		echo "Container smoke: worker stopped before becoming ready" >&2
		exit 1
	fi
	sleep 2
done

for service in server worker; do
	container_id="$(compose ps -q "$service")"
	if [[ -z "$container_id" || "$(docker inspect -f '{{.State.Running}}' "$container_id")" != "true" ]]; then
		echo "Container smoke: ${service} is not running" >&2
		exit 1
	fi
	if [[ "$(docker inspect -f '{{.RestartCount}}' "$container_id")" != "0" ]]; then
		echo "Container smoke: ${service} restarted during startup" >&2
		exit 1
	fi
	if [[ -n "$(docker inspect -f '{{.State.Error}}' "$container_id")" ]]; then
		echo "Container smoke: ${service} reports a container runtime error" >&2
		exit 1
	fi
done

if compose logs --no-color server worker 2>&1 | grep -Eiq \
	'initialization failed|failed to initialize|migration failed|startup lock.*failed'; then
	echo "Container smoke: initialization failure detected in application logs" >&2
	exit 1
fi

printf 'Container smoke passed: API=200/OK, web=%s, worker=ready\n' "$web_status" \
	| tee "${DIAGNOSTICS_DIR}/summary.txt"
