// Library text (titles, authors, series) arrives in whatever language the book
// is in, while <html lang> follows the UI locale. Tagging Japanese runs lets
// the browser apply Japanese line breaking (kinsoku, phrase-aware breaks) and
// lets CSS give them Japanese typography instead of the Latin tuning.

// Kana (full- and half-width) is unambiguous. Kanji-only strings also resolve
// to Japanese: the library is Japanese-first, and the ja rules are the right
// ones for Han-only titles here.
const JAPANESE_TEXT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

/** `"ja"` when the text contains Japanese script, otherwise undefined. */
export function detectTextLang(text: unknown): "ja" | undefined {
	return typeof text === "string" && JAPANESE_TEXT.test(text)
		? "ja"
		: undefined;
}

export type TypesetRole = "text" | "display";

/**
 * Props for an element that shows library text. Spreads `lang` plus a
 * `data-typeset` marker only when the text is Japanese, which is what the
 * Japanese typography rules in index.css key on. "display" is for large
 * headings, which need more leading than their Latin tuning gives them.
 */
export function typesetProps(
	text: unknown,
	role: TypesetRole = "text",
): { lang?: "ja"; "data-typeset"?: TypesetRole } {
	const lang = detectTextLang(text);
	return lang ? { lang, "data-typeset": role } : {};
}
