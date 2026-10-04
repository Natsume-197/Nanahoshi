import { expect, test } from "bun:test";
import { knownLanguageName } from "./language-names";

test("names a book's language in the app's language", () => {
	expect(knownLanguageName("ja", "es")).toBe("Japonés");
	expect(knownLanguageName("ja", "ja-JP")).toBe("日本語");
	expect(knownLanguageName("en", "en-US")).toBe("English");
});

test("accepts region-tagged and upper-case codes", () => {
	expect(knownLanguageName("JA-jp", "es")).toBe("Japonés");
});

test("falls back to English for an app language without names", () => {
	expect(knownLanguageName("ko", "fr")).toBe("Korean");
});

test("leaves unlisted codes to the caller", () => {
	expect(knownLanguageName("tlh", "es")).toBeNull();
});
