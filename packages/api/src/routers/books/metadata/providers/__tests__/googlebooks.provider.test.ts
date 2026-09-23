import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import sharp from "sharp";

// ─── Mocks ──────────────────────────────────────────────

let googleBooksConfig: {
	enabled: boolean;
	apiKey?: string;
	langRestrict?: string;
} = { enabled: true, apiKey: "test-key" };

// Includes every provider-config getter so this mock doesn't break the other
// provider test files sharing the same Bun process.
mock.module("../../../../settings/settings.service", () => ({
	getGoogleBooksConfig: () => Promise.resolve(googleBooksConfig),
	getAmazonConfig: () =>
		Promise.resolve({ domain: "co.jp", cookie: undefined, enabled: true }),
	getRanobedbConfig: () => Promise.resolve({ enabled: true }),
	getOpenLibraryConfig: () => Promise.resolve({ enabled: true }),
	getGoodreadsConfig: () => Promise.resolve({ enabled: true }),
	getComicvineConfig: () =>
		Promise.resolve({ enabled: true, apiKey: "test-key" }),
	getHardcoverConfig: () =>
		Promise.resolve({ enabled: true, apiToken: "test-token" }),
}));

const {
	downloadGoogleBooksCover,
	googleCoverCandidates,
	googlebooksProvider,
	isBlankNoImageCard,
	isGoogleBooksPlaceholder,
} = await import("../googlebooks.provider");

import { firstMatch } from "./first-match";

const realFetch = globalThis.fetch;
let fetchCalls: string[] = [];
let fetchHandler: (url: string) => unknown = () => ({ items: [] });

function installFetch() {
	globalThis.fetch = mock((input: string | URL | Request) => {
		const url = String(input);
		fetchCalls.push(url);
		const body = fetchHandler(url);
		if (body instanceof Response) return Promise.resolve(body);
		return Promise.resolve(
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as unknown as typeof fetch;
}

afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	googleBooksConfig = { enabled: true, apiKey: "test-key" };
	fetchCalls = [];
	fetchHandler = () => ({ items: [] });
	installFetch();
});

// ─── Fixtures ───────────────────────────────────────────

const RICH_VOLUME = {
	id: "vol-1",
	volumeInfo: {
		title: "ソードアート・オンライン, Vol. 3",
		subtitle: "A Subtitle",
		authors: ["川原 礫"],
		publisher: "KADOKAWA",
		publishedDate: "2013-06",
		description: "<p>An <b>HTML</b> description.</p>",
		industryIdentifiers: [
			{ type: "ISBN_10", identifier: "4048915649" },
			{ type: "ISBN_13", identifier: "9784048915649" },
		],
		pageCount: 0,
		printedPageCount: 280,
		categories: ["Fiction / Fantasy / General", "Fiction / Light Novel"],
		language: "ja",
		averageRating: 4.25,
		ratingsCount: 120,
		imageLinks: {
			thumbnail:
				"http://books.google.com/books/content?id=x&zoom=5&edge=curl&source=gbs",
			large: "http://books.google.com/books/content?id=x&zoom=1&source=gbs",
		},
		canonicalVolumeLink: "https://books.google.com/books/about/x.html",
	},
};

// ─── getMetadata ────────────────────────────────────────

describe("getMetadata", () => {
	test("returns empty when disabled for the org", async () => {
		googleBooksConfig = { enabled: false };
		const response = await firstMatch(googlebooksProvider, {
			title: "test",
			serverId: "org-1",
		});
		expect(response).toEqual({ metadata: {}, identity: null });
		expect(fetchCalls.length).toBe(0);
	});

	test("returns empty instead of calling Google without an API key", async () => {
		googleBooksConfig = { enabled: true };
		const response = await firstMatch(googlebooksProvider, {
			title: "test",
			serverId: "org-1",
		});
		expect(response).toEqual({ metadata: {}, identity: null });
		expect(fetchCalls).toHaveLength(0);
	});

	test("is unavailable without an organization or API key", async () => {
		expect(await googlebooksProvider.isAvailable(undefined)).toBe(false);
		googleBooksConfig = { enabled: true };
		expect(await googlebooksProvider.isAvailable("org-1")).toBe(false);
	});

	test("searches by ISBN first and maps the volume", async () => {
		fetchHandler = () => ({ items: [RICH_VOLUME] });
		const response = await firstMatch(googlebooksProvider, {
			isbn13: "9784048915649",
			title: "existing title",
			serverId: "org-1",
		});
		const result = response.metadata;

		expect(fetchCalls[0]).toContain("isbn%3A9784048915649");
		// Enrichment never overwrites the title
		expect(result.title).toBeUndefined();
		expect(response.identity).toMatchObject({
			kind: "book",
			title: "ソードアート・オンライン, Vol. 3",
			isbn13: "9784048915649",
		});
		expect(result.subtitle).toBe("A Subtitle");
		expect(result.description).toBe("An HTML description.");
		expect(result.publishedDate).toBe("2013-06-01");
		expect(result.languageCode).toBe("ja");
		expect(result.pageCount).toBe(280);
		expect(result.isbn10).toBe("4048915649");
		expect(result.isbn13).toBe("9784048915649");
		expect(result.authors).toEqual([{ name: "川原 礫", role: "Author" }]);
		expect(result.publisher).toEqual({ name: "KADOKAWA" });
		expect(result.genres).toEqual(["Fiction", "Fantasy", "Light Novel"]);
		expect(result.series).toEqual({
			name: "ソードアート・オンライン",
			position: 3,
		});
		expect(result.rating).toBe(4.25);
		expect(result.ratingCount).toBe(120);
	});

	test("falls back to intitle/inauthor search without ISBN", async () => {
		fetchHandler = () => ({ items: [RICH_VOLUME] });
		await firstMatch(googlebooksProvider, {
			title: "ソードアート・オンライン 3",
			authors: [{ name: "川原 礫", role: "Author" }],
			uuid: undefined,
			serverId: "org-1",
		});
		expect(fetchCalls[0]).toContain("intitle%3A");
		expect(fetchCalls[0]).toContain("inauthor%3A");
	});

	test("derives the missing ISBN-13 when only ISBN-10 is returned", async () => {
		fetchHandler = () => ({
			items: [
				{
					id: "vol-2",
					volumeInfo: {
						...RICH_VOLUME.volumeInfo,
						industryIdentifiers: [
							{ type: "ISBN_10", identifier: "4048915649" },
						],
					},
				},
			],
		});
		const { metadata: result } = await firstMatch(googlebooksProvider, {
			title: "ソードアート・オンライン 3",
			serverId: "org-1",
		});
		expect(result.isbn10).toBe("4048915649");
		expect(result.isbn13).toBe("9784048915649");
	});

	test("filters irrelevant title-only volumes", async () => {
		fetchHandler = () => ({
			items: [{ id: "junk", volumeInfo: { title: "Junk volume" } }],
		});
		const { metadata: result } = await firstMatch(googlebooksProvider, {
			title: "Junk",
			serverId: "org-1",
		});
		expect(result).toEqual({});
	});

	test("does not attach a cover when the book already has one", async () => {
		fetchHandler = () => ({ items: [RICH_VOLUME] });
		const { metadata: result } = await firstMatch(googlebooksProvider, {
			title: "ソードアート・オンライン 3",
			cover: "data/covers/existing.jpg",
			uuid: "book-uuid",
			serverId: "org-1",
		});
		expect(result.cover).toBeUndefined();
	});

	test("does not turn a protocol HTTP error into no results", async () => {
		fetchHandler = () => new Response("bad request", { status: 400 });
		await expect(
			firstMatch(googlebooksProvider, {
				title: "test",
				serverId: "org-1",
			}),
		).rejects.toThrow(/HTTP 400/);
	});

	test("throws ProviderTransientError on 5xx so the gap is retried", async () => {
		fetchHandler = () => new Response("error", { status: 500 });
		await expect(
			firstMatch(googlebooksProvider, { title: "test", serverId: "org-1" }),
		).rejects.toThrow(/temporarily unavailable/);
	});

	test("throws ProviderTransientError on 429 rate limiting", async () => {
		fetchHandler = () => new Response("slow down", { status: 429 });
		await expect(
			firstMatch(googlebooksProvider, { title: "test", serverId: "org-1" }),
		).rejects.toThrow(/temporarily unavailable/);
	});

	test.each([401, 403])(
		"does not turn HTTP %s into a false no-match",
		async (status) => {
			fetchHandler = () => new Response("invalid key", { status });
			await expect(
				firstMatch(googlebooksProvider, {
					title: "test",
					serverId: "org-1",
				}),
			).rejects.toMatchObject({ code: "invalid_credentials", status });
		},
	);

	test("applies langRestrict and API key from config", async () => {
		googleBooksConfig = {
			enabled: true,
			apiKey: "secret-key",
			langRestrict: "ja",
		};
		fetchHandler = () => ({ items: [] });
		await firstMatch(googlebooksProvider, {
			title: "test",
			serverId: "org-1",
		});
		expect(fetchCalls[0]).toContain("langRestrict=ja");
		expect(fetchCalls[0]).toContain("key=secret-key");
	});
});

// ─── search ─────────────────────────────────────────────

describe("search", () => {
	test("maps volumes to candidates", async () => {
		fetchHandler = () => ({ items: [RICH_VOLUME] });
		const candidates = await googlebooksProvider.search(
			{
				title: "ソードアート・オンライン",
			},
			{ serverId: "org-1" },
		);

		expect(candidates.length).toBe(1);
		const candidate = candidates[0];
		expect(candidate?.provider).toBe("googlebooks");
		expect(candidate?.providerId).toBe("vol-1");
		expect(candidate?.title).toBe("ソードアート・オンライン, Vol. 3");
		expect(candidate?.authors).toEqual([{ name: "川原 礫" }]);
		// https forced, zoom widened, edge=curl stripped
		expect(candidate?.previewCover).toStartWith("https://");
		expect(candidate?.previewCover).toContain("zoom=0");
		expect(candidate?.previewCover).not.toContain("edge=curl");
		expect(candidate?.url).toBe("https://books.google.com/books/about/x.html");
	});

	test("resolves a pasted ISBN via isbn query", async () => {
		fetchHandler = () => ({ items: [RICH_VOLUME] });
		await googlebooksProvider.search(
			{ title: "978-4-04-891564-9" },
			{ serverId: "org-1" },
		);
		expect(fetchCalls[0]).toContain("isbn%3A9784048915649");
	});

	test("throws ProviderTransientError on network failure", async () => {
		fetchHandler = () => {
			throw new Error("network down");
		};
		await expect(
			googlebooksProvider.search({ title: "test" }, { serverId: "org-1" }),
		).rejects.toThrow(/unreachable/);
	});
});

// ─── getById ────────────────────────────────────────────

describe("getById", () => {
	test("fetches the single-volume endpoint and keeps the title", async () => {
		fetchHandler = () => RICH_VOLUME;
		const result = await googlebooksProvider.getById("vol-1", {
			keepRemoteCover: true,
			serverId: "org-1",
		});
		expect(fetchCalls[0]).toContain("/volumes/vol-1");
		expect(result?.title).toBe("ソードアート・オンライン, Vol. 3");
		expect(result?.cover).toStartWith("https://");
	});

	test("returns null when the volume is missing", async () => {
		fetchHandler = () => new Response("not found", { status: 404 });
		const result = await googlebooksProvider.getById("missing", {
			serverId: "org-1",
		});
		expect(result).toBeNull();
	});

	test("strips the remote cover without keepRemoteCover", async () => {
		fetchHandler = () => RICH_VOLUME;
		const result = await googlebooksProvider.getById("vol-1", {
			serverId: "org-1",
		});
		expect(result?.cover).toBeUndefined();
	});
});

// ─── Cover placeholder fallback ─────────────────────────

// Mirrors Google's "image not available" card: a grayscale PNG that is almost
// entirely white with a little grey lettering.
async function placeholderPng(width = 575, height = 750) {
	const letteringWidth = Math.round(width / 3);
	const letteringHeight = Math.round(height / 20);
	const lettering = await sharp({
		create: {
			width: letteringWidth,
			height: letteringHeight,
			channels: 3,
			background: "#9a9a9a",
		},
	})
		.png()
		.toBuffer();
	return sharp({
		create: { width, height, channels: 3, background: "white" },
	})
		.composite([
			{
				input: lettering,
				top: Math.round((height - letteringHeight) / 2),
				left: Math.round((width - letteringWidth) / 2),
			},
		])
		.toColourspace("b-w")
		.png()
		.toBuffer();
}

async function photoJpeg() {
	const pixels = Buffer.alloc(128 * 182 * 3);
	for (let index = 0; index < pixels.length; index++) {
		pixels[index] = (index * 31) % 256;
	}
	return sharp(pixels, { raw: { width: 128, height: 182, channels: 3 } })
		.jpeg()
		.toBuffer();
}

const ZOOM0 =
	"https://books.google.com/books/content?id=oot8zgEACAAJ&printsec=frontcover&img=1&zoom=0&source=gbs_api";

describe("isGoogleBooksPlaceholder", () => {
	test("flags the blank no-image PNG at either placeholder size", async () => {
		expect(await isGoogleBooksPlaceholder(await placeholderPng())).toBe(true);
		expect(await isGoogleBooksPlaceholder(await placeholderPng(300, 391))).toBe(
			true,
		);
	});

	test("keeps real artwork and undecodable bytes are not its call", async () => {
		expect(await isGoogleBooksPlaceholder(await photoJpeg())).toBe(false);
		const colourfulPng = await sharp(await photoJpeg())
			.png()
			.toBuffer();
		expect(await isGoogleBooksPlaceholder(colourfulPng)).toBe(false);
		expect(await isGoogleBooksPlaceholder(Buffer.from("nope"))).toBe(false);
	});
});

describe("isBlankNoImageCard", () => {
	test("finds the card after the ingest re-encoded it as JPEG", async () => {
		const reencoded = await sharp(await placeholderPng())
			.toColourspace("srgb")
			.jpeg({ quality: 90 })
			.toBuffer();
		expect(await isGoogleBooksPlaceholder(reencoded)).toBe(false);
		expect(await isBlankNoImageCard(reencoded, { requirePng: false })).toBe(
			true,
		);
		expect(
			await isBlankNoImageCard(await photoJpeg(), { requirePng: false }),
		).toBe(false);
	});
});

describe("googleCoverCandidates", () => {
	test("tries full resolution first, then the zoom=1 thumbnail", () => {
		const [first, second, ...rest] = googleCoverCandidates(ZOOM0);
		expect(first).toBe(ZOOM0);
		expect(new URL(second ?? "").searchParams.get("zoom")).toBe("1");
		expect(new URL(second ?? "").searchParams.get("id")).toBe("oot8zgEACAAJ");
		expect(rest).toEqual([]);
	});

	test("leaves thumbnails and other hosts alone", () => {
		const thumb = ZOOM0.replace("zoom=0", "zoom=1");
		expect(googleCoverCandidates(thumb)).toEqual([thumb]);
		expect(googleCoverCandidates("https://example.com/c.jpg")).toEqual([
			"https://example.com/c.jpg",
		]);
	});
});

describe("downloadGoogleBooksCover", () => {
	// Simulates downloadCoverImage: serve the bytes per zoom and honour `accept`.
	function fakeDownload(byZoom: Record<string, Buffer>) {
		const calls: string[] = [];
		const download = async (
			url: string,
			uuid: string,
			options?: { accept?: (buffer: Buffer) => Promise<boolean> },
		) => {
			calls.push(url);
			const bytes = byZoom[new URL(url).searchParams.get("zoom") ?? ""];
			if (!bytes) return null;
			if (options?.accept && !(await options.accept(bytes))) return null;
			return `data/covers/${uuid}.jpg`;
		};
		return { calls, download };
	}

	test("falls back to the thumbnail when zoom=0 is the placeholder", async () => {
		const { calls, download } = fakeDownload({
			"0": await placeholderPng(),
			"1": await photoJpeg(),
		});
		const path = await downloadGoogleBooksCover(ZOOM0, "book-1", download);
		expect(path).toBe("data/covers/book-1.jpg");
		expect(calls).toHaveLength(2);
		expect(calls[1]).toContain("zoom=1");
	});

	test("keeps the full-resolution scan when Google has one", async () => {
		const { calls, download } = fakeDownload({
			"0": await photoJpeg(),
			"1": await photoJpeg(),
		});
		expect(await downloadGoogleBooksCover(ZOOM0, "book-1", download)).toBe(
			"data/covers/book-1.jpg",
		);
		expect(calls).toEqual([ZOOM0]);
	});

	test("stores nothing when every zoom level is a placeholder", async () => {
		const { download } = fakeDownload({
			"0": await placeholderPng(),
			"1": await placeholderPng(128, 182),
		});
		expect(
			await downloadGoogleBooksCover(ZOOM0, "book-1", download),
		).toBeNull();
	});
});
