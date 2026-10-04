type UiLanguage = "en" | "es" | "ja";

// Hermes has no Intl.DisplayNames, so book languages would read "JA". The
// languages a library actually holds, named in each app language.
const NAMES: Record<string, Record<UiLanguage, string>> = {
	ja: { en: "Japanese", es: "Japonés", ja: "日本語" },
	en: { en: "English", es: "Inglés", ja: "英語" },
	es: { en: "Spanish", es: "Español", ja: "スペイン語" },
	zh: { en: "Chinese", es: "Chino", ja: "中国語" },
	ko: { en: "Korean", es: "Coreano", ja: "韓国語" },
	fr: { en: "French", es: "Francés", ja: "フランス語" },
	de: { en: "German", es: "Alemán", ja: "ドイツ語" },
	it: { en: "Italian", es: "Italiano", ja: "イタリア語" },
	pt: { en: "Portuguese", es: "Portugués", ja: "ポルトガル語" },
	ru: { en: "Russian", es: "Ruso", ja: "ロシア語" },
};

/** "ja" / "ja-JP" → "Japonés" in a Spanish UI; null for codes not listed. */
export function knownLanguageName(code: string, uiLocale: string) {
	const names = NAMES[code.toLowerCase().split(/[-_]/)[0] ?? ""];
	if (!names) return null;
	const ui = uiLocale.toLowerCase().split(/[-_]/)[0] as UiLanguage;
	return names[ui] ?? names.en;
}
