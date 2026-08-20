import { describe, expect, test } from "bun:test";
import type { OrgSettingsSection } from "@/components/settings/settings-sections";
import { resolveVisibleOrgSettingsSection } from "./server-settings-access";

const sections: OrgSettingsSection[] = [
	"general",
	"stats",
	"libraries",
	"metadata",
	"recommendations",
	"opds",
	"members",
	"roles",
	"invitations",
	"access",
];

function visibility(
	visible: OrgSettingsSection[],
): Record<OrgSettingsSection, boolean> {
	return Object.fromEntries(
		sections.map((section) => [section, visible.includes(section)]),
	) as Record<OrgSettingsSection, boolean>;
}

describe("server settings authorization fallback", () => {
	test("never renders a requested section the member cannot see", () => {
		expect(
			resolveVisibleOrgSettingsSection("members", visibility(["opds"])),
		).toBe("opds");
	});

	test("renders no server settings when no section is permitted", () => {
		expect(
			resolveVisibleOrgSettingsSection("members", visibility([])),
		).toBeNull();
	});
});
