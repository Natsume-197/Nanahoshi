import { describe, expect, test } from "bun:test";
import type { EbookDocument, HtmlContent } from "@nanahoshi-v2/ebook-parser";
import { JSDOM } from "jsdom";
import { adaptHtmlEbook } from "./html-ebook.adapter";

describe("HTML ebook chapter structure", () => {
	test("groups untitled spine sections under the preceding TOC chapter", async () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const previousNode = globalThis.Node;
		const previousHTMLElement = globalThis.HTMLElement;
		globalThis.Node = dom.window.Node;
		globalThis.HTMLElement = dom.window.HTMLElement;

		try {
			const content: HtmlContent = {
				kind: "html",
				sections: [
					{ id: "start" },
					{ id: "start-continuation" },
					{ id: "chapter-two" },
					{ id: "chapter-two-continuation" },
				],
				toc: [
					{ label: "Start", target: { sectionId: "start" } },
					{ label: "Chapter two", target: { sectionId: "chapter-two" } },
				],
				async openSection(id) {
					return { html: `<p>${id}</p>`, styles: [] };
				},
				async openResource() {
					return undefined;
				},
			};
			const ebook: EbookDocument = {
				format: "epub",
				metadata: {
					identifier: "fixture",
					identifiers: [],
					title: "Fixture",
					subtitle: "",
					authors: [],
					publisher: "",
					language: "en",
					published: "",
					description: "",
					subjects: [],
					rights: "",
					contributors: [],
				},
				content,
				async openCover() {
					return undefined;
				},
				async close() {},
			};

			const data = await adaptHtmlEbook(
				ebook,
				"fixture",
				"Fallback",
				dom.window.document,
			);

			expect(data.sections).toMatchObject([
				{ reference: "nanahoshi-epub-start", label: "Start" },
				{
					reference: "nanahoshi-epub-start-continuation",
					parentChapter: "nanahoshi-epub-start",
				},
				{ reference: "nanahoshi-epub-chapter-two", label: "Chapter two" },
				{
					reference: "nanahoshi-epub-chapter-two-continuation",
					parentChapter: "nanahoshi-epub-chapter-two",
				},
			]);
		} finally {
			globalThis.Node = previousNode;
			globalThis.HTMLElement = previousHTMLElement;
			dom.window.close();
		}
	});
});
