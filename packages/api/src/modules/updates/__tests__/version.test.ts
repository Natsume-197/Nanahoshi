import { describe, expect, test } from "bun:test";
import { compareVersions, isNewerVersion, parseVersion } from "../version";

describe("compareVersions", () => {
	test("orders by major, minor and patch", () => {
		expect(compareVersions("v1.2.3", "v1.2.4")).toBe(-1);
		expect(compareVersions("v1.10.0", "v1.9.9")).toBe(1);
		expect(compareVersions("v2.0.0", "v2.0.0")).toBe(0);
	});

	test("ranks a release above its prereleases, and prereleases by identifier", () => {
		expect(compareVersions("v1.3.0", "v1.3.0-rc.2")).toBe(1);
		expect(compareVersions("v1.3.0-rc.2", "v1.3.0-rc.10")).toBe(-1);
		expect(compareVersions("v1.3.0-alpha", "v1.3.0-beta")).toBe(-1);
		expect(compareVersions("v1.3.0-rc.1", "v1.3.0-rc.1.1")).toBe(-1);
	});

	test("refuses to order a development build", () => {
		expect(compareVersions("development", "v1.0.0")).toBeNull();
		expect(isNewerVersion("v9.0.0", "development")).toBe(false);
		expect(parseVersion("latest")).toBeNull();
	});
});
