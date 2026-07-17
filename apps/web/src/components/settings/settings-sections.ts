const SETTINGS_SECTIONS = [
	"profile",
	"account",
	"appearance",
	"language",
	"addons-metadata",
	"admin-system",
	"admin-tasks",
	"admin-users",
	"admin-servers",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
