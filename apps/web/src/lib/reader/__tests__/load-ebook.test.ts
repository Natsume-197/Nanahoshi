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

	it("builds its scratch DOM in an inert document, not the live one", async () => {
		// Guards the fix for doomed `ttu:` image requests: the placeholder-laden
		// tree must be assembled in a browsing-context-less document so its images
		// never hit the network. jsdom can't observe the requests, so assert the
		// mechanism — an inert document is created and no <img> is built in the
		// live document.
		const originalCreate = document.implementation.createHTMLDocument.bind(
			document.implementation,
		);
		const originalCreateElement = document.createElement.bind(document);
		let inertDocs = 0;
		const liveImgTags: string[] = [];
		document.implementation.createHTMLDocument = ((title?: string) => {
			inertDocs++;
			return originalCreate(title);
		}) as typeof document.implementation.createHTMLDocument;
		document.createElement = ((
			tag: string,
			options?: ElementCreationOptions,
		) => {
			if (/^(img|image)$/i.test(tag)) liveImgTags.push(tag);
			return originalCreateElement(tag, options);
		}) as typeof document.createElement;

		try {
			await adaptHtmlEbook(ebook, "book-id", "Fallback", document);
		} finally {
			document.implementation.createHTMLDocument = originalCreate;
			document.createElement = originalCreateElement;
		}

		expect(inertDocs).toBeGreaterThan(0);
		expect(liveImgTags).toEqual([]);
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

	it("resolves EPUB resource paths (ebook-resource:PATH)", async () => {
		const epub = {
			...ebook,
			format: "epub" as const,
			content: {
				...ebook.content,
				sections: [{ id: "ch1" }],
				toc: [],
				openSection: async () => ({
					html: '<p>Text</p><img src="ebook-resource:OEBPS%2FImages%2Fcover.jpg">',
					styles: [],
				}),
				openResource: async (href: string) => {
					expect(href).toBe("ebook-resource:OEBPS%2FImages%2Fcover.jpg");
					return { data: Uint8Array.of(0xff, 0xd8), mediaType: "image/jpeg" };
				},
			},
		};

		const data = await adaptHtmlEbook(epub, "epub-id", "Fallback", document);
		expect(data.elementHtml).toContain("ttu:epub/resource-0.jpg");
		expect(Object.keys(data.blobs)).toContain("epub/resource-0.jpg");
	});

	it("skips SVG nested-ref processing when content is not actually SVG", async () => {
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
							data: new TextEncoder().encode(
								'<html><body><img src="kindle:embed:000B?mime=image/jpeg"/></body></html>',
							),
							mediaType: "image/svg+xml",
						};
					}
					throw new Error("Should not resolve nested resources of non-SVG");
				},
			},
		};

		const data = await adaptHtmlEbook(azw3, "non-svg", "Fallback", document);
		expect(data.blobs["azw3/resource-0.svg"]).toBeDefined();
		const stored = await data.blobs["azw3/resource-0.svg"]?.text();
		expect(stored).toContain("kindle:embed:000B");
	});

	it("skips resources that throw (out-of-bounds PDB records)", async () => {
		const azw3 = {
			...ebook,
			content: {
				...ebook.content,
				sections: [{ id: "0" }],
				toc: [],
				openSection: async () => ({
					html: '<p>Text</p><img src="ebook-resource:embed:ZZ?type=image%2Fjpeg">',
					styles: [],
				}),
				openResource: async (href: string) => {
					if (href.includes("embed:ZZ"))
						throw new RangeError("MOBI record 222 is out of bounds");
					return { data: Uint8Array.of(1), mediaType: "image/jpeg" };
				},
			},
		};

		const data = await adaptHtmlEbook(azw3, "oob-id", "Fallback", document);
		expect(Object.keys(data.blobs)).toEqual([]);
		expect(data.elementHtml).not.toContain("ttu:");
	});

	it("prepends cover section when cover is not already in the spine", async () => {
		const coverBytes = Uint8Array.of(99, 99, 99);
		const withCover = {
			...ebook,
			content: {
				...ebook.content,
				sections: [{ id: "0" }],
				toc: [],
				openSection: async () => ({
					html: '<p>Chapter text</p><img src="ebook-resource:embed:1?type=image%2Fjpeg">',
					styles: [],
				}),
				openResource: async () => ({
					data: new Uint8Array([1]),
					mediaType: "image/jpeg",
				}),
			},
			openCover: async () => ({ data: coverBytes, mediaType: "image/jpeg" }),
		};

		const data = await adaptHtmlEbook(
			withCover,
			"cover-id",
			"Fallback",
			document,
		);
		expect(data.sections[0]?.reference).toBe("ttu-azw3-cover");
		expect(data.sections[1]?.reference).toBe("ttu-azw3-0");
		expect(Object.keys(data.blobs)).toContain("azw3/resource-1.jpg");
		expect(data.elementHtml).toMatch(/ttu-azw3-cover.*ttu-azw3-0/s);
	});

	it("skips cover injection when cover matches a spine image", async () => {
		const sharedBytes = new Uint8Array([1]);
		const withDupCover = {
			...ebook,
			content: {
				...ebook.content,
				sections: [{ id: "0" }],
				toc: [],
				openSection: async () => ({
					html: '<img src="ebook-resource:embed:1?type=image%2Fjpeg">',
					styles: [],
				}),
				openResource: async () => ({
					data: sharedBytes,
					mediaType: "image/jpeg",
				}),
			},
			openCover: async () => ({ data: sharedBytes, mediaType: "image/jpeg" }),
		};

		const data = await adaptHtmlEbook(
			withDupCover,
			"dup-id",
			"Fallback",
			document,
		);
		expect(data.sections[0]?.reference).toBe("ttu-azw3-0");
		expect(data.sections.every((s) => s.reference !== "ttu-azw3-cover")).toBe(
			true,
		);
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
