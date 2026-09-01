import { describe, expect, test } from "bun:test";
import {
	getBookUuidFromPath,
	isLinkPreviewRequest,
	renderBookLinkPreviewHtml,
} from "./book-link-preview";

const uuid = "506e5ff3-e86f-56b8-8a45-736b306b17ab";

describe("book link previews", () => {
	test("recognizes the book detail URL and common unfurl bots", () => {
		expect(getBookUuidFromPath(`/dashboard/books/${uuid}`)).toBe(uuid);
		expect(getBookUuidFromPath(`/dashboard/books/${uuid}/`)).toBe(uuid);
		expect(getBookUuidFromPath(`/reader/${uuid}`)).toBeNull();
		expect(
			isLinkPreviewRequest(
				new Request(`https://library.example/dashboard/books/${uuid}`, {
					headers: { "user-agent": "Mozilla/5.0 Discordbot/2.0" },
				}),
			),
		).toBe(true);
	});

	test("does not intercept a normal browser request", () => {
		expect(
			isLinkPreviewRequest(
				new Request(`https://library.example/dashboard/books/${uuid}`, {
					headers: { "user-agent": "Mozilla/5.0 Firefox/145.0" },
				}),
			),
		).toBe(false);
	});

	test("renders escaped title, author, synopsis, and cover metadata", () => {
		const html = renderBookLinkPreviewHtml({
			preview: {
				title: 'A <Book> & "Story"',
				authors: ["Ada Lovelace"],
				description: "<p>A useful &amp; concise synopsis</p>",
				cover: "data/covers/book.jpg",
			},
			url: `https://library.example/dashboard/books/${uuid}`,
			coverUrl: "https://api.example/api/data/covers/book.jpg",
		});

		expect(html).toContain("A &lt;Book&gt; &amp; &quot;Story&quot;");
		expect(html).toContain("Ada Lovelace · A useful &amp; concise synopsis");
		expect(html).toContain('property="og:image"');
		expect(html).toContain('property="og:type" content="book"');
	});
});
