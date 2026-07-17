const SETTINGS_SECTIONS = [
	"profile",
	"account",
	"appearance",
	"language",
	"overview",
	"users",
	"servers",
	"metadata",
	"tasks",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
