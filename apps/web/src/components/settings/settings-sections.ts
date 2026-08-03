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
	"logs",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
