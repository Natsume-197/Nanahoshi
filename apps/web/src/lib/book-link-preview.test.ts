import { describe, expect, test } from "bun:test";
import {
	getCatalogPreviewTarget,
	isLinkPreviewRequest,
	renderCatalogLinkPreviewHtml,
} from "./book-link-preview";

const uuid = "506e5ff3-e86f-56b8-8a45-736b306b17ab";

describe("book link previews", () => {
	test("recognizes every supported catalog detail URL", () => {
		expect(getCatalogPreviewTarget(`/dashboard/books/${uuid}`)).toEqual({
			kind: "book",
			uuid,
		});
		expect(getCatalogPreviewTarget(`/dashboard/audiobooks/${uuid}/`)).toEqual({
			kind: "audiobook",
			uuid,
		});
		expect(getCatalogPreviewTarget(`/dashboard/series/${uuid}`)).toEqual({
			kind: "ebook-series",
			uuid,
		});
		expect(
			getCatalogPreviewTarget(`/dashboard/audiobooks/series/${uuid}`),
		).toEqual({ kind: "audiobook-series", uuid });
		expect(getCatalogPreviewTarget(`/reader/${uuid}`)).toBeNull();
	});

	test("recognizes common unfurl bots", () => {
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
		const html = renderCatalogLinkPreviewHtml({
			preview: {
				title: 'A <Book> & "Story"',
				authors: ["Ada Lovelace"],
				description: "<p>A useful &amp; concise synopsis</p>",
				cover: "data/covers/book.jpg",
			},
			kind: "book",
			url: `https://library.example/dashboard/books/${uuid}`,
			coverUrl: "https://api.example/api/data/covers/book.jpg",
		});

		expect(html).toContain("A &lt;Book&gt; &amp; &quot;Story&quot;");
		expect(html).toContain("Ada Lovelace · A useful &amp; concise synopsis");
		expect(html).toContain('property="og:image"');
		expect(html).toContain('property="og:type" content="book"');
	});

	test("renders series as a website Open Graph object", () => {
		const html = renderCatalogLinkPreviewHtml({
			preview: {
				title: "A Series",
				authors: ["Author One"],
				description: null,
				cover: null,
				covers: [],
			},
			kind: "audiobook-series",
			url: `https://library.example/dashboard/audiobooks/series/${uuid}`,
			coverUrl: null,
		});
		expect(html).toContain('property="og:type" content="website"');
	});
});
