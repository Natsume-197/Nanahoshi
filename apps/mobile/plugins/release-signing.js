// Plain JS: Expo loads config plugins without transpiling TypeScript.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// nanahoshi: upload signing";

/** Gradle properties (~/.gradle/gradle.properties or ORG_GRADLE_PROJECT_*)
 * holding the Play upload key. Without them release falls back to the debug
 * key: fine for sideloaded APKs, rejected by Play (build-aab.sh refuses it). */
const UPLOAD_PROPS = {
	storeFile: "NANAHOSHI_UPLOAD_STORE_FILE",
	storePassword: "NANAHOSHI_UPLOAD_STORE_PASSWORD",
	keyAlias: "NANAHOSHI_UPLOAD_KEY_ALIAS",
	keyPassword: "NANAHOSHI_UPLOAD_KEY_PASSWORD",
};

const RELEASE_SIGNING = /(release \{[^}]*?)signingConfig signingConfigs\.debug/;

/** @param {string} gradle */
function addReleaseSigning(gradle) {
	if (gradle.includes(MARKER)) return gradle;
	if (!gradle.includes("signingConfigs {") || !RELEASE_SIGNING.test(gradle)) {
		throw new Error(
			"release-signing: app/build.gradle no longer matches the template",
		);
	}
	const p = UPLOAD_PROPS;
	const upload = `signingConfigs {
        ${MARKER}
        if (findProperty('${p.storeFile}')) {
            upload {
                storeFile file(findProperty('${p.storeFile}'))
                storePassword findProperty('${p.storePassword}')
                keyAlias findProperty('${p.keyAlias}')
                keyPassword findProperty('${p.keyPassword}')
            }
        }`;
	return gradle.replace("signingConfigs {", upload).replace(
		RELEASE_SIGNING,
		`$1signingConfig signingConfigs.findByName('upload') ?: signingConfigs.debug
            ndk { debugSymbolLevel 'SYMBOL_TABLE' }`,
	);
}

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withReleaseSigning = (config) =>
	withAppBuildGradle(config, (mod) => {
		mod.modResults.contents = addReleaseSigning(mod.modResults.contents);
		return mod;
	});

module.exports = withReleaseSigning;
module.exports.addReleaseSigning = addReleaseSigning;
