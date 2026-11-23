#!/usr/bin/env bash
# Builds the Play Store App Bundle (all ABIs, signed with the upload key) into dist/.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "${APP_VARIANT:-}" ]; then
	echo "build-aab: unset APP_VARIANT; Play only gets the production app" >&2
	exit 1
fi

export JAVA_HOME="${JAVA_HOME:-$HOME/Android/jdk-17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

gradle_prop() {
	local env="ORG_GRADLE_PROJECT_$1"
	[ -n "${!env:-}" ] && return 0
	grep -qs "^$1=" "${GRADLE_USER_HOME:-$HOME/.gradle}/gradle.properties"
}
for prop in NANAHOSHI_UPLOAD_STORE_FILE NANAHOSHI_UPLOAD_STORE_PASSWORD \
	NANAHOSHI_UPLOAD_KEY_ALIAS NANAHOSHI_UPLOAD_KEY_PASSWORD; do
	if ! gradle_prop "$prop"; then
		echo "build-aab: $prop is not set (see apps/mobile/README.md, Releasing)" >&2
		exit 1
	fi
done

bun run reader:bundle

# versionCode and plugins only reach android/ through prebuild.
bash scripts/prebuild-android.sh --clean

(cd android && ./gradlew app:bundleRelease)

version=$(node -p "require('./app.json').expo.version")
code=$(node -p "require('./app.json').expo.android.versionCode")
aab="android/app/build/outputs/bundle/release/app-release.aab"
if "$JAVA_HOME/bin/keytool" -printcert -jarfile "$aab" | grep -q "CN=Android Debug"; then
	echo "build-aab: bundle is signed with the debug key" >&2
	exit 1
fi

mkdir -p dist
out="dist/nanahoshi-${version}-${code}.aab"
cp "$aab" "$out"
echo "AAB: $(pwd)/$out"
