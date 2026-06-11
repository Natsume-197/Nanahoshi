/** Stable identifiers for each settings section, carried in the URL. */
export const SETTINGS_SECTIONS = [
	"profile",
	"account",
	"org-general",
	"org-libraries",
	"org-members",
	"org-opds",
	"org-discord",
	"addons-metadata",
	"admin-system",
	"admin-tasks",
	"admin-users",
	"admin-organizations",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function isSettingsSection(value: unknown): value is SettingsSection {
	return (
		typeof value === "string" &&
		SETTINGS_SECTIONS.includes(value as SettingsSection)
	);
}
