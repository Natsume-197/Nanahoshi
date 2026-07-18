import { describe, expect, test } from "bun:test";
import {
	deriveIsbnPair,
	extractIsbnFromText,
	isbn10To13,
	isbn13To10,
	normalizePublishedDate,
	stripHtml,
} from "../provider.utils";

// ─── ISBN-10 ↔ ISBN-13 ──────────────────────────────────

describe("isbn10To13", () => {
	test("converts valid ISBN-10s", () => {
		expect(isbn10To13("4048915649")).toBe("9784048915649");
		expect(isbn10To13("0306406152")).toBe("9780306406157");
	});

	test("handles the X check digit", () => {
		expect(isbn10To13("097522980X")).toBe("9780975229804");
		expect(isbn10To13("097522980x")).toBe("9780975229804");
	});

	test("accepts hyphens and spaces", () => {
		expect(isbn10To13("4-04-891564-9")).toBe("9784048915649");
	});

	test("rejects invalid checksums and shapes", () => {
		expect(isbn10To13("4048915640")).toBeNull();
		expect(isbn10To13("123")).toBeNull();
		expect(isbn10To13("not-an-isbn")).toBeNull();
	});
});

describe("isbn13To10", () => {
	test("converts valid 978-prefixed ISBN-13s", () => {
		expect(isbn13To10("9784048915649")).toBe("4048915649");
		expect(isbn13To10("9780306406157")).toBe("0306406152");
	});

	test("produces the X check digit when needed", () => {
		expect(isbn13To10("9780975229804")).toBe("097522980X");
	});

	test("rejects 979-prefixed ISBNs (no ISBN-10 equivalent)", () => {
		expect(isbn13To10("9791092674002")).toBeNull();
	});

	test("rejects invalid checksums", () => {
		expect(isbn13To10("9784048915640")).toBeNull();
	});
});

describe("deriveIsbnPair", () => {
	test("fills isbn13 from isbn10", () => {
		expect(deriveIsbnPair({ isbn10: "4048915649" })).toEqual({
			isbn10: "4048915649",
			isbn13: "9784048915649",
		});
	});

	test("fills isbn10 from isbn13", () => {
		expect(deriveIsbnPair({ isbn13: "9784048915649" })).toEqual({
			isbn10: "4048915649",
			isbn13: "9784048915649",
		});
	});

	test("leaves both untouched when both are present", () => {
		const both = { isbn10: "0000000000", isbn13: "9784048915649" };
		expect(deriveIsbnPair({ ...both })).toEqual(both);
	});

	test("leaves invalid identifiers alone", () => {
		expect(deriveIsbnPair({ isbn10: "garbage" })).toEqual({
			isbn10: "garbage",
		});
	});
});

// ─── Text/date helpers ──────────────────────────────────

describe("normalizePublishedDate", () => {
	test("pads partial ISO dates", () => {
		expect(normalizePublishedDate("2013")).toBe("2013-01-01");
		expect(normalizePublishedDate("2013-06")).toBe("2013-06-01");
		expect(normalizePublishedDate("2013-06-15")).toBe("2013-06-15");
	});

	test("parses textual dates", () => {
		expect(normalizePublishedDate("Jun 15, 2013")).toBe("2013-06-15");
		expect(normalizePublishedDate("June 2013")).toBe("2013-06-01");
	});

	test("returns null for garbage", () => {
		expect(normalizePublishedDate("unknown")).toBeNull();
		expect(normalizePublishedDate("")).toBeNull();
		expect(normalizePublishedDate(null)).toBeNull();
	});
});

describe("stripHtml", () => {
	test("strips tags and entities", () => {
		expect(stripHtml("<p>Hello <b>world</b> &amp; more</p>")).toBe(
			"Hello world & more",
		);
	});
});

describe("extractIsbnFromText", () => {
	test("recognizes ISBN-13 and ISBN-10 with hyphens", () => {
		expect(extractIsbnFromText("978-4-04-891564-9")).toBe("9784048915649");
		expect(extractIsbnFromText("097522980x")).toBe("097522980X");
	});

	test("rejects regular titles", () => {
		expect(extractIsbnFromText("The Hobbit")).toBeNull();
	});
});
