import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

let googleBooksConfig: {
	enabled: boolean;
	apiKey?: string;
	langRestrict?: string;
} = { enabled: true };

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

const { googlebooksProvider } = await import("../googlebooks.provider");

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
	googleBooksConfig = { enabled: true };
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
		const response = await googlebooksProvider.getMetadata({
			title: "test",
			serverId: "org-1",
		});
		expect(response).toEqual({ metadata: {}, identity: null });
		expect(fetchCalls.length).toBe(0);
	});

	test("searches by ISBN first and maps the volume", async () => {
		fetchHandler = () => ({ items: [RICH_VOLUME] });
		const response = await googlebooksProvider.getMetadata({
			isbn13: "9784048915649",
			title: "existing title",
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
	});

	test("falls back to intitle/inauthor search without ISBN", async () => {
		fetchHandler = () => ({ items: [RICH_VOLUME] });
		await googlebooksProvider.getMetadata({
			title: "ソードアート・オンライン 3",
			authors: [{ name: "川原 礫", role: "Author" }],
			uuid: undefined,
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
		const { metadata: result } = await googlebooksProvider.getMetadata({
			title: "ソードアート・オンライン 3",
		});
		expect(result.isbn10).toBe("4048915649");
		expect(result.isbn13).toBe("9784048915649");
	});

	test("filters irrelevant title-only volumes", async () => {
		fetchHandler = () => ({
			items: [{ id: "junk", volumeInfo: { title: "Junk volume" } }],
		});
		const { metadata: result } = await googlebooksProvider.getMetadata({
			title: "Junk",
		});
		expect(result).toEqual({});
	});

	test("does not attach a cover when the book already has one", async () => {
		fetchHandler = () => ({ items: [RICH_VOLUME] });
		const { metadata: result } = await googlebooksProvider.getMetadata({
			title: "ソードアート・オンライン 3",
			cover: "data/covers/existing.jpg",
			uuid: "book-uuid",
		});
		expect(result.cover).toBeUndefined();
	});

	test("fails soft on permanent HTTP errors (4xx)", async () => {
		fetchHandler = () => new Response("bad request", { status: 400 });
		const { metadata: result } = await googlebooksProvider.getMetadata({
			title: "test",
		});
		expect(result).toEqual({});
	});

	test("throws ProviderTransientError on 5xx so the gap is retried", async () => {
		fetchHandler = () => new Response("error", { status: 500 });
		await expect(
			googlebooksProvider.getMetadata({ title: "test" }),
		).rejects.toThrow(/temporarily unavailable/);
	});

	test("throws ProviderTransientError on 429 rate limiting", async () => {
		fetchHandler = () => new Response("slow down", { status: 429 });
		await expect(
			googlebooksProvider.getMetadata({ title: "test" }),
		).rejects.toThrow(/temporarily unavailable/);
	});

	test("applies langRestrict and API key from config", async () => {
		googleBooksConfig = {
			enabled: true,
			apiKey: "secret-key",
			langRestrict: "ja",
		};
		fetchHandler = () => ({ items: [] });
		await googlebooksProvider.getMetadata({
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
		const candidates = await googlebooksProvider.search({
			title: "ソードアート・オンライン",
		});

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
		await googlebooksProvider.search({ title: "978-4-04-891564-9" });
		expect(fetchCalls[0]).toContain("isbn%3A9784048915649");
	});

	test("throws ProviderTransientError on network failure", async () => {
		fetchHandler = () => {
			throw new Error("network down");
		};
		await expect(googlebooksProvider.search({ title: "test" })).rejects.toThrow(
			/unreachable/,
		);
	});
});

// ─── getById ────────────────────────────────────────────

describe("getById", () => {
	test("fetches the single-volume endpoint and keeps the title", async () => {
		fetchHandler = () => RICH_VOLUME;
		const result = await googlebooksProvider.getById("vol-1", {
			keepRemoteCover: true,
		});
		expect(fetchCalls[0]).toContain("/volumes/vol-1");
		expect(result?.title).toBe("ソードアート・オンライン, Vol. 3");
		expect(result?.cover).toStartWith("https://");
	});

	test("returns null when the volume is missing", async () => {
		fetchHandler = () => new Response("not found", { status: 404 });
		const result = await googlebooksProvider.getById("missing");
		expect(result).toBeNull();
	});

	test("strips the remote cover without keepRemoteCover", async () => {
		fetchHandler = () => RICH_VOLUME;
		const result = await googlebooksProvider.getById("vol-1");
		expect(result?.cover).toBeUndefined();
	});
});
