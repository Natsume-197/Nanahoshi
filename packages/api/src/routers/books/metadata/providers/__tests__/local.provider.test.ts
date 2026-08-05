import { describe, expect, mock, test } from "bun:test";
import type {
	HtmlContent,
	PagedContent,
} from "@nanahoshi-v2/ebook-parser/types";

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

const { classifyEbookIdentifiers, measureContentForm } = await import(
	"../local-ebook"
);

function content(chapters: (string | (() => never))[]): HtmlContent {
	return {
		kind: "html",
		sections: chapters.map((_, index) => ({ id: String(index) })),
		toc: [],
		async openSection(id) {
			const chapter = chapters[Number(id)];
			if (typeof chapter === "function") return chapter();
			return { html: chapter ?? "", styles: [] };
		},
		async openResource() {
			return undefined;
		},
	};
}

describe("local ebook catalog adapter", () => {
	test("classifies labeled and raw ebook identifiers", () => {
		expect(
			classifyEbookIdentifiers({
				identifier: "publisher-42",
				identifiers: [
					{ value: "publisher-42", id: "uid" },
					{ value: "B08R8G4XMQ", scheme: "MOBI-ASIN" },
					{ value: "978-4-04-073127-8", scheme: "ISBN" },
				],
			}),
		).toEqual({
			asin: "B08R8G4XMQ",
			isbn10: null,
			isbn13: "9784040731278",
			embeddedUid: null,
		});
	});

	test("keeps a stable opaque primary identifier when no store id exists", () => {
		expect(
			classifyEbookIdentifiers({
				identifier: "3299511152",
				identifiers: [{ value: "3299511152", id: "uid" }],
			}),
		).toMatchObject({ embeddedUid: "3299511152" });
	});

	test("measures prose and page-image ebooks through HtmlContent", async () => {
		await expect(
			measureContentForm(content([`<body>${"あ".repeat(4000)}</body>`])),
		).resolves.toBe("text");
		await expect(
			measureContentForm(
				content(Array.from({ length: 12 }, () => '<img src="page.jpg">')),
			),
		).resolves.toBe("images");
	});

	test("classifies paged ebook content as images", async () => {
		const pages: PagedContent = {
			kind: "pages",
			pages: [{ id: "page-1" }],
			async openPage() {
				return undefined;
			},
		};
		await expect(measureContentForm(pages)).resolves.toBe("images");
	});

	test("a broken section does not abort content measurement", async () => {
		const broken = () => {
			throw new RangeError("Out of bounds access");
		};
		await expect(
			measureContentForm(content([broken, "<p>Readable</p>"])),
		).resolves.toBe("text");
	});
});
