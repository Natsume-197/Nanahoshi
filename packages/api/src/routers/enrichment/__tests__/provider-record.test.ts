import { describe, expect, test } from "bun:test";
import { remoteCoverUrl, toDetailMetadata } from "../provider-record";

describe("toDetailMetadata", () => {
	test("maps a book provider record into the tray's comparison shape", () => {
		const metadata = toDetailMetadata({
			title: "Ignored here",
			description: "  A story  ",
			publishedDate: "2021-04-01",
			isbn10: "4040000000",
			isbn13: "9784040000000",
			pageCount: 320,
			authors: [
				{ name: "Author" },
				{ name: "Painter", role: "Illustrator" },
				{ name: "Writer", role: "Author" },
			],
			publisher: { name: "KADOKAWA" },
			series: { name: "Konosuba", position: 13 },
			genres: ["Fantasy", { uuid: "x", name: "fantasy" }, "Comedy"],
		});
		expect(metadata).toMatchObject({
			description: "A story",
			isbn: "9784040000000",
			pageCount: 320,
			authors: ["Author", "Writer"],
			publisher: "KADOKAWA",
			series: { name: "Konosuba", position: "13" },
			genres: ["fantasy", "comedy"],
			narrators: [],
			duration: null,
		});
	});

	test("maps an audiobook record with a string publisher and narrators", () => {
		const metadata = toDetailMetadata({
			isbn: "978",
			asin: "B0",
			duration: 3600,
			narrators: [{ name: "Voice" }],
			publisher: "Audible Studios",
			series: { name: "Saga", position: null },
		});
		expect(metadata.isbn).toBe("978");
		expect(metadata.duration).toBe(3600);
		expect(metadata.narrators).toEqual(["Voice"]);
		expect(metadata.publisher).toBe("Audible Studios");
		expect(metadata.series).toEqual({ name: "Saga", position: null });
	});

	test("empty or junk values read as missing", () => {
		const metadata = toDetailMetadata({
			description: "   ",
			pageCount: 0,
			series: { name: "" },
			authors: null,
		});
		expect(metadata.description).toBeNull();
		expect(metadata.pageCount).toBeNull();
		expect(metadata.series).toBeNull();
		expect(metadata.authors).toEqual([]);
	});
});

describe("remoteCoverUrl", () => {
	test("only URLs are exposed", () => {
		expect(remoteCoverUrl("https://img/a.jpg")).toBe("https://img/a.jpg");
		expect(remoteCoverUrl("data/covers/a.jpg")).toBeNull();
		expect(remoteCoverUrl(undefined)).toBeNull();
	});
});
