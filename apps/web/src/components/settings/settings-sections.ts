export const SETTINGS_SECTIONS = [
	"profile",
	"account",
	"privacy",
	"integrations",
	"appearance",
	"language",
	"overview",
	"users",
	"servers",
	"registration",
	"metadata",
	"honomiya",
	"data-backups",
	"tasks",
	"logs",
	"activity",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function isSettingsSection(value: string): value is SettingsSection {
	return (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export type OrgSettingsSection =
	| "general"
	| "stats"
	| "libraries"
	| "metadata"
	| "recommendations"
	| "opds"
	| "members"
	| "roles"
	| "invitations"
	| "access";

export const ORG_SETTINGS_SECTIONS = [
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
] as const satisfies readonly OrgSettingsSection[];

export function isOrgSettingsSection(
	value: string,
): value is OrgSettingsSection {
	return (ORG_SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/** Deep-link action to perform on open, beyond just landing on the section. */
export type OrgSettingsIntent = "create-library";
