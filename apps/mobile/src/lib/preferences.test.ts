import { describe, expect, it } from "bun:test";
import {
	parseAppearancePreference,
	parseLanguagePreference,
	resolveLanguage,
} from "./preferences";

describe("language preference", () => {
	it("follows the device when nothing valid was stored", () => {
		expect(parseLanguagePreference(null)).toBe("system");
		expect(parseLanguagePreference("fr")).toBe("system");
		expect(resolveLanguage("system", "ja")).toBe("ja");
	});

	it("falls back to English on a device language the app lacks", () => {
		expect(resolveLanguage("system", "fr")).toBe("en");
		expect(resolveLanguage("system", undefined)).toBe("en");
	});

	it("an explicit choice wins over the device", () => {
		expect(resolveLanguage(parseLanguagePreference("es"), "ja")).toBe("es");
	});
});

describe("appearance preference", () => {
	it("keeps light and dark, anything else follows the system", () => {
		expect(parseAppearancePreference("dark")).toBe("dark");
		expect(parseAppearancePreference("light")).toBe("light");
		expect(parseAppearancePreference("sepia")).toBe("system");
		expect(parseAppearancePreference(null)).toBe("system");
	});
});
