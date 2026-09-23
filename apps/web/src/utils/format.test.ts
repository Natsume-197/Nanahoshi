import { describe, expect, it, test } from "bun:test";
import { capitalizeFirst, formatTimeUntil } from "./format";

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

describe("formatTimeUntil", () => {
	const now = Date.UTC(2026, 0, 1);
	test("picks minutes, hours or days by distance", () => {
		expect(formatTimeUntil(new Date(now + 5 * 60_000), now)).toMatch(/5/);
		expect(formatTimeUntil(new Date(now + 3 * 3_600_000), now)).toMatch(/3/);
		expect(formatTimeUntil(new Date(now + 24 * 3_600_000), now)).toMatch(/1/);
		expect(formatTimeUntil(new Date(now + 24 * 3_600_000), now)).not.toMatch(
			/1440|24/,
		);
	});
});
