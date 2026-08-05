import "@/test-utils/setup-dom";
import { describe, expect, it } from "bun:test";

const ebook = {
	format: "azw3" as const,
	metadata: {
		identifier: "id",
		identifiers: [],
		title: "Native title",
		subtitle: "",
		authors: [],
		publisher: "",
		language: "en-US",
		published: "",
		description: "",
		subjects: [],
		rights: "",
		contributors: [],
	},
	content: {
		kind: "html" as const,
		sections: [{ id: "0" }, { id: "1" }],
		toc: [{ label: "Chapter one", target: { sectionId: "0" } }],
		openSection: async (id: string) =>
			id === "0"
				? {
						html: '<p>Hello ebook</p><img src="ebook-resource:embed:1?type=image%2Fjpeg">',
						styles: [
							'.illustration { background-image: url("ebook-resource:embed:2?type=font%2Fwoff2"); }',
						],
					}
				: { html: "<p>Second chapter</p>", styles: [] },
		openResource: async (href: string) =>
			href.includes(":1?")
				? { data: new Uint8Array([1]), mediaType: "image/jpeg" }
				: { data: new Uint8Array([2]), mediaType: "font/woff2" },
	},
	openCover: async () => undefined,
	close: async () => {},
};

const { adaptHtmlEbook } = await import("../html-ebook.adapter");
const { adaptPagedEbook } = await import("../paged-ebook.adapter");

describe("loadEbook", () => {
	it("adapts HTML ebooks and persists their resources", async () => {
		const data = await adaptHtmlEbook(ebook, "book-id", "Fallback", document);

		expect(data.title).toBe("Native title");
		expect(data.language).toBe("en");
		expect(data.elementHtml).toContain("Hello ebook");
		expect(data.elementHtml).toContain("ttu:azw3/resource-0.jpg");
		expect(data.styleSheet).toContain("ttu:azw3/resource-1.woff2");
		expect(Object.keys(data.blobs)).toEqual([
			"azw3/resource-0.jpg",
			"azw3/resource-1.woff2",
		]);
		expect(data.sections[0]).toMatchObject({
			reference: "ttu-azw3-0",
			label: "Chapter one",
		});
		expect(data.characters).toBeGreaterThan(0);
	});

	it("resolves Kindle resource URLs nested inside SVG resources", async () => {
		const originalFileReader = globalThis.FileReader;
		globalThis.FileReader = class {
			result: string | null = null;
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;

			readAsDataURL(blob: Blob) {
				void blob
					.arrayBuffer()
					.then((bytes) => {
						this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
						this.onload?.();
					})
					.catch(() => this.onerror?.());
			}
		} as unknown as typeof FileReader;

		try {
			const svg =
				'<svg xmlns="http://www.w3.org/2000/svg"><image href="kindle:embed:000B?mime=image/jpeg" /></svg>';
			const azw3 = {
				...ebook,
				content: {
					...ebook.content,
					sections: [{ id: "0" }],
					toc: [],
					openSection: async () => ({
						html: '<img src="ebook-resource:flow:1?type=image%2Fsvg%2Bxml">',
						styles: [],
					}),
					openResource: async (href: string) => {
						if (href.includes("flow:1")) {
							return {
								data: new TextEncoder().encode(svg),
								mediaType: "image/svg+xml",
							};
						}
						expect(href).toBe("ebook-resource:embed:000B?type=image%2Fjpeg");
						return { data: Uint8Array.of(1), mediaType: "image/jpeg" };
					},
				},
			};

			const data = await adaptHtmlEbook(azw3, "svg-book", "Fallback", document);
			const storedSvg = await data.blobs["azw3/resource-0.svg"]?.text();

			expect(storedSvg).toContain("data:image/jpeg;base64,");
		} finally {
			globalThis.FileReader = originalFileReader;
		}
	});

	it("adapts comic pages to TTU image sections", async () => {
		const comic = {
			...ebook,
			format: "cbz" as const,
			metadata: { ...ebook.metadata, title: "Native comic" },
			content: {
				kind: "pages" as const,
				pages: [
					{ id: "pages/1.jpg", label: "Page 1" },
					{ id: "pages/2.png", label: "Page 2" },
				],
				openPage: async (id: string) =>
					id.endsWith(".jpg")
						? { data: Uint8Array.of(1), mediaType: "image/jpeg" }
						: { data: Uint8Array.of(2), mediaType: "image/png" },
			},
		};
		const data = await adaptPagedEbook(comic, "comic-id", "Fallback", document);

		expect(data.sourceFormat).toBe("cbz");
		expect(data.contentForm).toBe("images");
		expect(data.presentation).toMatchObject({ layout: "pre-paginated" });
		expect(data.title).toBe("Native comic");
		expect(data.elementHtml).toContain("ttu-no-text");
		expect(data.elementHtml).toContain("ttu:cbz/page-0001.jpg");
		expect(data.elementHtml).toContain("ttu:cbz/page-0002.png");
		expect(Object.keys(data.blobs)).toEqual([
			"cbz/page-0001.jpg",
			"cbz/page-0002.png",
		]);
		expect(data.sections.map(({ label }) => label)).toEqual([
			"Page 1",
			"Page 2",
		]);
		expect(data.characters).toBe(2);
	});

	it("classifies image-only HTML publications and marks their visual pages", async () => {
		const visual = {
			...ebook,
			format: "epub" as const,
			metadata: {
				...ebook.metadata,
				presentation: {
					layout: "pre-paginated",
					spread: "landscape",
					declaresPageResolution: true,
					pageProgressionDirection: "rtl" as const,
				},
			},
			content: {
				...ebook.content,
				sections: [{ id: "page-1" }, { id: "page-2" }],
				toc: [],
				openSection: async (id: string) => ({
					html: `<img src="ebook-resource:${id}">`,
					styles: [],
				}),
				openResource: async () => ({
					data: Uint8Array.of(1),
					mediaType: "image/jpeg",
				}),
			},
		};

		const data = await adaptHtmlEbook(
			visual,
			"visual-id",
			"Fallback",
			document,
		);

		expect(data.contentForm).toBe("images");
		expect(data.presentation?.pageProgressionDirection).toBe("rtl");
		expect(data.elementHtml.match(/ttu-no-text/g)?.length).toBe(4);
	});
});
