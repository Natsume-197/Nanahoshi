import { describe, expect, test } from "bun:test";
import type { ExpoConfig } from "expo/config";
import { applyAppVariant } from "../app.config";
import appJson from "../app.json";

const base = appJson.expo as ExpoConfig;

describe("app variants", () => {
	test("production keeps the published identity", () => {
		const config = applyAppVariant(base, undefined);
		expect(config.android?.package).toBe("app.nanahoshi.mobile");
		expect(config.ios?.bundleIdentifier).toBe("app.nanahoshi.mobile");
		expect(config.scheme).toBe("nanahoshi");
		expect(config.slug).toBe("nanahoshi");
	});

	test("development installs beside production under its own identity", () => {
		const config = applyAppVariant(base, "development");
		expect(config.name).toBe("Nanahoshi Dev");
		expect(config.android?.package).toBe("app.nanahoshi.mobile.dev");
		expect(config.ios?.bundleIdentifier).toBe("app.nanahoshi.mobile.dev");
		expect(config.scheme).toBe("nanahoshi-dev");
		expect(config.slug).toBe("nanahoshi-dev");
		expect(config.android?.adaptiveIcon?.foregroundImage).toBe(
			base.android?.adaptiveIcon?.foregroundImage,
		);
		expect(config.plugins).toEqual(base.plugins);
	});
});
