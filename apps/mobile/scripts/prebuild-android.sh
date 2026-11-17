#!/usr/bin/env bash
# Regenerates android/ when it is missing, when --clean is passed, or when it
# was generated for the other APP_VARIANT (the package id gives it away).
set -euo pipefail

cd "$(dirname "$0")/.."

expected=$(bunx expo config --type public --json | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).android.package))')
current=$(sed -n "s/^ *applicationId '\(.*\)'/\1/p" android/app/build.gradle 2>/dev/null || true)

if [ "${1:-}" = "--clean" ] || [ "$current" != "$expected" ]; then
	echo "android/: ${current:-missing} -> $expected"
	bunx expo prebuild -p android --clean
fi
