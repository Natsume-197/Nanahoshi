const SETTINGS_SECTIONS = [
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
	"tasks",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
