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

# Max parallel `bun test` processes. Override with TEST_JOBS=N; TEST_JOBS=1
# restores the old sequential behavior, or lower it on constrained runners.
# The default is capped at 4: beyond that, timing-sensitive frontend tests
# (5s per-test timeouts) flake on typical dev boxes, while CI runners have 4
# vCPUs anyway, so the cap changes nothing there.
_default_jobs="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"
if [ "$_default_jobs" -gt 4 ] 2>/dev/null; then _default_jobs=4; fi
TEST_JOBS="${TEST_JOBS:-$_default_jobs}"
case "$TEST_JOBS" in
"" | *[!0-9]* | 0) TEST_JOBS=4 ;;
esac

# Deterministic order so local and CI enumerate identically.
mapfile -t files < <(
	find apps/server/src apps/web/src apps/web/scripts packages/api/src packages/auth/src packages/env/src packages/ebook-parser/src packages/read-listen/src packages/db/src scripts \
		\( -name "*.test.ts" -o -name "*.test.tsx" \) | sort
)

echo "Running ${#files[@]} test files in isolation (jobs: $TEST_JOBS)..."

# Each file still runs in its own `bun test` process (see header comment).
# Jobs run in the background bounded by TEST_JOBS; per-file output is spooled
# to temp files and replayed in sorted order so results stay deterministic.
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

run_file() {
	local idx="$1"
	local file="$2"
	if ! bun test "$file" >"$tmpdir/out-$idx.log" 2>&1; then
		echo "$file" >"$tmpdir/failed-$idx"
	fi
}

running=0
idx=0
for f in "${files[@]}"; do
	run_file "$idx" "$f" &
	running=$((running + 1))
	idx=$((idx + 1))
	if [ "$running" -ge "$TEST_JOBS" ]; then
		wait -n || true
		running=$((running - 1))
	fi
done
wait || true

if [ "${#files[@]}" -gt 0 ]; then
	for i in $(seq 0 $(( ${#files[@]} - 1 ))); do
		cat "$tmpdir/out-$i.log"
	done
fi

failed=()
if [ "${#files[@]}" -gt 0 ]; then
	for i in $(seq 0 $(( ${#files[@]} - 1 ))); do
		if [ -f "$tmpdir/failed-$i" ]; then
			failed+=("$(cat "$tmpdir/failed-$i")")
		fi
	done
fi

echo
if [ ${#failed[@]} -gt 0 ]; then
	echo "❌ ${#failed[@]} test file(s) failed:"
	printf '  %s\n' "${failed[@]}"
	exit 1
fi

echo "✅ All ${#files[@]} test files passed."
