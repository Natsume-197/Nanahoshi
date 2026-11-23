import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { addReleaseSigning } from "./release-signing.js";

const template = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`;

describe("release signing", () => {
	test("release uses the upload key when configured; debug keeps the debug key", () => {
		const out = addReleaseSigning(template);
		expect(out).toContain("if (findProperty('NANAHOSHI_UPLOAD_STORE_FILE'))");
		const release = out.slice(out.indexOf("release {"));
		expect(release).toContain(
			"signingConfig signingConfigs.findByName('upload') ?: signingConfigs.debug",
		);
		expect(release).toContain("debugSymbolLevel 'SYMBOL_TABLE'");
		const debug = out.slice(
			out.indexOf("buildTypes {"),
			out.indexOf("release {"),
		);
		expect(debug).toContain("signingConfig signingConfigs.debug");
	});

	test("applying twice changes nothing", () => {
		const once = addReleaseSigning(template);
		expect(addReleaseSigning(once)).toBe(once);
	});

	test("a template without the release signing line fails loudly", () => {
		expect(() =>
			addReleaseSigning(template.replace(/release \{[\s\S]*?\}/, "release {}")),
		).toThrow();
	});

	test("matches the build.gradle Expo generates, when present", () => {
		let gradle: string;
		try {
			gradle = readFileSync(
				`${import.meta.dir}/../android/app/build.gradle`,
				"utf8",
			);
		} catch {
			return;
		}
		expect(() => addReleaseSigning(gradle)).not.toThrow();
	});
});
