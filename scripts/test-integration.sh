#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

required_variables=(
	DB_HOST
	DB_PORT
	DB_USER
	DB_PASSWORD
	DB_NAME
	REDIS_HOST
	REDIS_PORT
)

for variable in "${required_variables[@]}"; do
	if [[ -z "${!variable:-}" ]]; then
		echo "Missing required environment variable: ${variable}" >&2
		exit 1
	fi
done

export SEARCH_INTEGRATION=1
export RECS_INTEGRATION=1
export SERVER_DELETE_INTEGRATION=1
export SCAN_RECOVERY_INTEGRATION=1

files=(
	packages/api/src/infrastructure/search/pgroonga/__tests__/pgroonga.provider.integration.test.ts
	packages/api/src/infrastructure/search/pgroonga/__tests__/pgroonga.volume-ranking.integration.test.ts
	packages/api/src/modules/scanning/__tests__/scan-recovery.integration.test.ts
	packages/api/src/routers/recommendations/__tests__/recommendations.integration.test.ts
	packages/api/src/routers/server-profile/__tests__/server-profile.delete.integration.test.ts
)

mapfile -t discovered_files < <(
	find packages/api/src -type f -name '*.integration.test.ts' -print | sort
)
mapfile -t listed_files < <(printf '%s\n' "${files[@]}" | sort)

if [[ ${#files[@]} -ne 5 ]]; then
	echo "Expected exactly 5 integration test files, listed ${#files[@]}." >&2
	exit 1
fi

if [[ "${listed_files[*]}" != "${discovered_files[*]}" ]]; then
	echo "Integration test list is out of sync with the repository." >&2
	echo "Update scripts/test-integration.sh before running the suite." >&2
	exit 1
fi

echo "Preparing integration database..."
bun run db:migrate

echo "Running ${#files[@]} integration test files in isolation..."

failed=()
for file in "${files[@]}"; do
	if ! bun test "$file"; then
		failed+=("$file")
	fi
done

echo
if [[ ${#failed[@]} -gt 0 ]]; then
	echo "FAIL: ${#failed[@]} integration test file(s) failed:"
	printf '  %s\n' "${failed[@]}"
	exit 1
fi

echo "PASS: All ${#files[@]} integration test files passed."
