import { describe, expect, test } from "bun:test";
import { isSettingsSection } from "./settings-sections";

describe("settings routes", () => {
	test("accepts real sections and rejects unknown deep links", () => {
		expect(isSettingsSection("appearance")).toBe(true);
		expect(isSettingsSection("not-a-setting")).toBe(false);
	});
});
