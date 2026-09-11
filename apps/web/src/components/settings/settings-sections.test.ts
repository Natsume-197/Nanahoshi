import { describe, expect, test } from "bun:test";
import {
	isOrgSettingsSection,
	isSettingsSection,
	ORG_SETTINGS_SECTIONS,
} from "./settings-sections";

describe("settings routes", () => {
	test("accepts real sections and rejects unknown deep links", () => {
		expect(isSettingsSection("appearance")).toBe(true);
		expect(isSettingsSection("not-a-setting")).toBe(false);
	});

	test("accepts real server sections and rejects unknown deep links", () => {
		expect(isOrgSettingsSection("libraries")).toBe(true);
		expect(isOrgSettingsSection("profile")).toBe(false);
		expect(ORG_SETTINGS_SECTIONS).toHaveLength(10);
	});
});
