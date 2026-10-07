/** Device-local preferences: what the user picked in Settings, parsed from
 * storage and resolved against what the device offers. */

export const LANGUAGES = ["en", "es", "ja"] as const;
export type Language = (typeof LANGUAGES)[number];
export type LanguagePreference = "system" | Language;

// Each language is listed under its own name, as iOS and Android do.
export const LANGUAGE_NAMES: Record<Language, string> = {
	en: "English",
	es: "Español",
	ja: "日本語",
};

export type AppearancePreference = "system" | "light" | "dark" | "amoled";

function isLanguage(value: string | null | undefined): value is Language {
	return (LANGUAGES as readonly string[]).includes(value ?? "");
}

export function parseLanguagePreference(
	stored: string | null,
): LanguagePreference {
	return isLanguage(stored) ? stored : "system";
}

export function resolveLanguage(
	preference: LanguagePreference,
	deviceLanguage: string | null | undefined,
): Language {
	if (preference !== "system") return preference;
	return isLanguage(deviceLanguage) ? deviceLanguage : "en";
}

export function parseAppearancePreference(
	stored: string | null,
): AppearancePreference {
	return stored === "light" || stored === "dark" || stored === "amoled"
		? stored
		: "system";
}
