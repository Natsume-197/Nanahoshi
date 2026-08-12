import { describe, expect, it } from "bun:test";
import { capitalizeFirst } from "./format";

describe("capitalizeFirst", () => {
	it("capitalizes a lowercase facet name", () => {
		expect(capitalizeFirst("action")).toBe("Action");
	});

	it("leaves the rest of the name alone", () => {
		expect(capitalizeFirst("science fiction")).toBe("Science fiction");
		expect(capitalizeFirst("iSekai")).toBe("ISekai");
	});

	it("returns an already-capitalized name unchanged", () => {
		expect(capitalizeFirst("Romance")).toBe("Romance");
	});

	it("returns non-cased scripts unchanged", () => {
		expect(capitalizeFirst("ライトノベル")).toBe("ライトノベル");
		expect(capitalizeFirst("恋愛")).toBe("恋愛");
	});

	it("keeps astral first characters whole", () => {
		expect(capitalizeFirst("😀 genre")).toBe("😀 genre");
	});

	it("handles an empty name", () => {
		expect(capitalizeFirst("")).toBe("");
	});
});
