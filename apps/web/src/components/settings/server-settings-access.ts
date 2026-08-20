import type { OrgSettingsSection } from "@/components/settings/settings-sections";

const ORG_SETTINGS_ORDER: readonly OrgSettingsSection[] = [
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

export function resolveVisibleOrgSettingsSection(
	requested: OrgSettingsSection,
	canSee: Record<OrgSettingsSection, boolean>,
): OrgSettingsSection | null {
	if (canSee[requested]) return requested;
	return ORG_SETTINGS_ORDER.find((candidate) => canSee[candidate]) ?? null;
}
