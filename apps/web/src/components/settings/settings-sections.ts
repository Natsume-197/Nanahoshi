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
