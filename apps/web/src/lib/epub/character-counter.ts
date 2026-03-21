/**
 * Count Japanese characters (Hiragana, Katakana, Kanji)
 */
export function getJapaneseCharacterCount(text: string): number {
	if (!text) return 0;
	const japaneseRegex =
		/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〻]/gu;
	const matches = text.match(japaneseRegex);
	return matches ? matches.length : 0;
}

/**
 * Count all characters except symbols/punctuation
 */
export function getTextCharacterCount(text: string): number {
	if (!text) return 0;
	const textRegex = /[\p{L}\p{N}\p{Zs}]+/gu;
	const matches = text.match(textRegex);
	if (!matches) return 0;
	return matches.reduce((sum, m) => sum + [...m].length, 0);
}

/**
 * Dispatcher based on language
 */
export function getCharacterCountByLanguage(
	text: string,
	lang: string,
): number {
	switch (lang) {
		case "ja":
			return getJapaneseCharacterCount(text);
		default:
			return getTextCharacterCount(text);
	}
}
