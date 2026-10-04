#!/usr/bin/env bash
# Builds a standalone Android APK (JS bundled in, no Metro) into dist/.
# Usage: build-apk.sh [release|debug] [--clean] [--all-abis]
set -euo pipefail

cd "$(dirname "$0")/.."

variant="release"
clean=0
abis="arm64-v8a"
for arg in "$@"; do
	case "$arg" in
	release | debug) variant="$arg" ;;
	--clean) clean=1 ;;
	--all-abis) abis="armeabi-v7a,arm64-v8a,x86,x86_64" ;;
	*)
		echo "unknown argument: $arg" >&2
		exit 1
		;;
	esac
done

export JAVA_HOME="${JAVA_HOME:-$HOME/Android/jdk-17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

bun run reader:bundle

if [ "$clean" = 1 ] || [ ! -d android ]; then
	bunx expo prebuild -p android --clean
fi

task="assemble${variant^}"
(cd android && ./gradlew "app:$task" -PreactNativeArchitectures="$abis")

version=$(node -p "require('./app.json').expo.version")
mkdir -p dist
out="dist/nanahoshi-${version}-${variant}.apk"
cp "android/app/build/outputs/apk/${variant}/app-${variant}.apk" "$out"
echo "APK: $(pwd)/$out"
