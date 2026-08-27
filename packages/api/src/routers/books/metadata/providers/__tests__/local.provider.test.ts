import { describe, expect, mock, test } from "bun:test";
import type {
	EbookDocument,
	HtmlContent,
	PagedContent,
} from "@nanahoshi-v2/ebook-parser/types";
import sharp from "sharp";

const openEbookFile = mock(async (): Promise<EbookDocument> => {
	throw new Error("openEbookFile mock was not configured");
});

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/ebook-parser/node", () => ({ openEbookFile }));

const {
	classifyEbookIdentifiers,
	findFallbackCover,
	isBlankCover,
	measureContentForm,
	readLocalEbook,
	sanitizeEmbeddedTitle,
} = await import("../local-ebook");

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

async function detailedImage(width: number, height: number): Promise<Buffer> {
	const pixels = Buffer.alloc(width * height * 3);
	for (let index = 0; index < pixels.length; index++) {
		pixels[index] = (index * 31 + Math.floor(index / 97) * 17) % 256;
	}
	return sharp(pixels, { raw: { width, height, channels: 3 } })
		.jpeg()
		.toBuffer();
}

describe("local ebook catalog adapter", () => {
	test("drops whitespace-only publication dates", async () => {
		openEbookFile.mockResolvedValueOnce({
			format: "azw3",
			metadata: {
				identifier: "B00HSC62IM",
				identifiers: [{ value: "B00HSC62IM", scheme: "ASIN" }],
				title: "盾の勇者の成り上がり 3 (MFブックス)",
				subtitle: "",
				authors: [],
				publisher: "",
				language: "ja",
				published: " ",
				description: "",
				subjects: [],
				rights: "",
				contributors: [],
			},
			content: {
				kind: "pages",
				pages: [],
				async openPage() {
					return undefined;
				},
			},
			async openCover() {
				return undefined;
			},
			async close() {},
		});

		const metadata = await readLocalEbook(
			"/library/shield-hero-3.azw3",
			"b99a24ac-f20e-549f-bbc0-55cb19403cec",
		);

		expect(metadata.publishedDate).toBeUndefined();
	});

	test("removes absolute source paths embedded as publication titles", () => {
		expect(
			sanitizeEmbeddedTitle(
				"D:\\wwwroot\\converter\\Las_Ventajas_de_ser_Invisible.epub",
			),
		).toBe("Las_Ventajas_de_ser_Invisible");
		expect(sanitizeEmbeddedTitle("/srv/books/The Odyssey.pdf")).toBe(
			"The Odyssey",
		);
		expect(sanitizeEmbeddedTitle("Fate/stay night")).toBe("Fate/stay night");
	});

	test("rejects near-white declared cover placeholders", async () => {
		const blank = await sharp({
			create: {
				width: 1200,
				height: 1600,
				channels: 3,
				background: "#ffffff",
			},
		})
			.jpeg()
			.toBuffer();
		const artwork = await sharp({
			create: {
				width: 1200,
				height: 1600,
				channels: 3,
				background: "#3355cc",
			},
		})
			.composite([
				{
					input: Buffer.from(
						"<svg><circle cx='600' cy='800' r='400' fill='red'/></svg>",
					),
				},
			])
			.jpeg()
			.toBuffer();
		expect(await isBlankCover(blank)).toBe(true);
		expect(await isBlankCover(artwork)).toBe(false);
	});

	test("ranks safe early-spine artwork and rejects logos and placeholders", async () => {
		const logo = await detailedImage(180, 180);
		const blank = await sharp({
			create: {
				width: 1200,
				height: 1600,
				channels: 3,
				background: "#ffffff",
			},
		})
			.jpeg()
			.toBuffer();
		const artwork = await detailedImage(900, 1300);
		const resources = new Map<string, Buffer>([
			["ebook-resource:logo.jpg", logo],
			["ebook-resource:placeholder.jpg", blank],
			["ebook-resource:front-cover.jpg", artwork],
		]);
		const source: HtmlContent = {
			kind: "html",
			sections: [{ id: "title" }, { id: "cover" }],
			toc: [],
			async openSection(id) {
				return id === "title"
					? {
							html: '<picture><source srcset="ebook-resource:logo.jpg 1x, ebook-resource:placeholder.jpg 2x"></picture>',
							styles: [],
						}
					: {
							html: '<svg><image href="ebook-resource:front-cover.jpg"/></svg>',
							styles: [],
						};
			},
			async openResource(href) {
				const data = resources.get(href);
				return data ? { data, mediaType: "image/jpeg" } : undefined;
			},
		};

		const selected = await findFallbackCover(source);
		expect(Buffer.from(selected?.data ?? [])).toEqual(artwork);
	});

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

	test("classifies fixed pages from their semantic text sample", async () => {
		const pdf = (textLength: number): PagedContent => ({
			kind: "pages",
			pages: [{ id: "page-1" }],
			async openPage() {
				return undefined;
			},
			async sampleText() {
				return { textLength, sampledPages: 1 };
			},
		});
		await expect(measureContentForm(pdf(400))).resolves.toBe("text");
		await expect(measureContentForm(pdf(0))).resolves.toBe("images");
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
