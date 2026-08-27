#!/usr/bin/env bash

# Run each test file in its own `bun test` process.
#
# Bun shares one process across every test file, and `mock.module` registrations
# leak globally and permanently within that process. That makes the whole suite
# order-dependent: a file can pass only because an earlier file happened to
# register a mock it relies on, and the filesystem's readdir order differs
# between machines (local vs CI) — which is exactly how green-locally turns into
# red-on-CI. Isolating each file in its own process removes the shared global
# state entirely, so results are deterministic and every file must stand alone.

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

# Web modules validate this URL while importing the client environment. Tests
# replace their transport, so a stable local default is sufficient.
export VITE_SERVER_URL="${VITE_SERVER_URL:-http://localhost:3000}"

# Deterministic order so local and CI enumerate identically.
mapfile -t files < <(
	find apps/server/src apps/web/src apps/web/scripts packages/api/src packages/auth/src packages/ebook-parser/src packages/read-listen/src packages/db/src scripts \
		\( -name "*.test.ts" -o -name "*.test.tsx" \) | sort
)

echo "Running ${#files[@]} test files in isolation..."

failed=()
for f in "${files[@]}"; do
	if ! bun test "$f"; then
		failed+=("$f")
	fi
done

echo
if [ ${#failed[@]} -gt 0 ]; then
	echo "❌ ${#failed[@]} test file(s) failed:"
	printf '  %s\n' "${failed[@]}"
	exit 1
fi

echo "✅ All ${#files[@]} test files passed."
