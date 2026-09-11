import {
	ORG_SETTINGS_SECTIONS,
	type OrgSettingsSection,
} from "@/components/settings/settings-sections";

export function resolveVisibleOrgSettingsSection(
	requested: OrgSettingsSection,
	canSee: Record<OrgSettingsSection, boolean>,
): OrgSettingsSection | null {
	if (canSee[requested]) return requested;
	return ORG_SETTINGS_SECTIONS.find((candidate) => canSee[candidate]) ?? null;
}
