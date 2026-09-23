import { describe, expect, test } from "bun:test";
import { previewCoverUrl } from "./lifecycle";

describe("previewCoverUrl", () => {
	test("Google Books covers are asked for the thumbnail that exists", () => {
		const url = previewCoverUrl(
			"https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=0&source=gbs_api",
		);
		expect(new URL(url ?? "").searchParams.get("zoom")).toBe("1");
		expect(new URL(url ?? "").searchParams.get("id")).toBe("abc");
	});

	test("other hosts and empty values pass through", () => {
		expect(previewCoverUrl("https://m.media-amazon.com/a.jpg")).toBe(
			"https://m.media-amazon.com/a.jpg",
		);
		expect(previewCoverUrl(null)).toBeNull();
		expect(previewCoverUrl("not a url")).toBe("not a url");
	});
});
