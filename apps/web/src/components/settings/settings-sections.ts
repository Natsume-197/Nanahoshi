const SETTINGS_SECTIONS = [
	"profile",
	"account",
	"addons-metadata",
	"admin-system",
	"admin-tasks",
	"admin-users",
	"admin-organizations",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
