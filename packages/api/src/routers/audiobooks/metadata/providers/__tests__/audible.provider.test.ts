import { afterAll, beforeEach, describe, expect, test } from "bun:test";

// Neutralize the provider throttle so tests don't sleep between requests.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void) =>
	realSetTimeout(fn, 0)) as typeof setTimeout;

const realFetch = globalThis.fetch;
const fetchCalls: string[] = [];
let fetchResponder: (url: string) => Response = () =>
	new Response("{}", { status: 200 });

globalThis.fetch = (async (input: string | URL | Request) => {
	const url = String(input);
	fetchCalls.push(url);
	return fetchResponder(url);
}) as typeof fetch;

const { audibleProvider } = await import("../audible.provider");

afterAll(() => {
	globalThis.fetch = realFetch;
	globalThis.setTimeout = realSetTimeout;
});

const AUDNEXUS_BOOK = {
	asin: "B0EXAMPLE1",
	title: "Great Story",
	authors: [{ name: "Jane Doe" }],
	narrators: [{ name: "Nora Reader" }],
	summary: "<p>A tale of <b>tests</b></p>",
	language: "english",
	publisherName: "Acme Audio",
	releaseDate: "2024-05-01",
	runtimeLengthMin: 90,
	rating: "4.6",
	// Audnexus mixes both facets in `genres`, discriminated by `type`
	genres: [
		{ asin: "g1", name: "Science Fiction & Fantasy", type: "genre" },
		{ asin: "g2", name: "Fantasy", type: "genre" },
		{ asin: "t1", name: "Isekai", type: "tag" },
		{ asin: "t2", name: "LitRPG", type: "tag" },
	],
};

beforeEach(() => {
	fetchCalls.length = 0;
	fetchResponder = () =>
		new Response(JSON.stringify(AUDNEXUS_BOOK), { status: 200 });
});

describe("audible provider", () => {
	test.each([
		["第27巻", 27],
		["オフシーズン : 21", 21],
		["６．５", 6.5],
		["Lv.６．５", 6.5],
		["結 1", null],
		["短編集", null],
		["死物語 : 下", null],
		["1-3", null],
	])("preserves series with position %s", async (position, expected) => {
		fetchResponder = () =>
			new Response(
				JSON.stringify({
					...AUDNEXUS_BOOK,
					seriesPrimary: { name: "Series", position },
				}),
				{ status: 200 },
			);
		expect(
			(await audibleProvider.getById("B0EXAMPLE1", { region: "jp" }))?.series,
		).toEqual({ name: "Series", position: expected });
	});

	test("getById splits Audnexus genres into genres and tags by type", async () => {
		const metadata = await audibleProvider.getById("B0EXAMPLE1", {
			region: "us",
		});

		expect(metadata?.genres).toEqual(["Science Fiction & Fantasy", "Fantasy"]);
		expect(metadata?.tags).toEqual(["Isekai", "LitRPG"]);
	});

	test("getById omits tags when Audnexus returns only genre entries", async () => {
		fetchResponder = () =>
			new Response(
				JSON.stringify({
					...AUDNEXUS_BOOK,
					genres: [{ asin: "g1", name: "Mystery", type: "genre" }],
				}),
				{ status: 200 },
			);

		const metadata = await audibleProvider.getById("B0EXAMPLE1", {
			region: "us",
		});

		expect(metadata?.genres).toEqual(["Mystery"]);
		expect(metadata?.tags).toBeUndefined();
	});

	test("getById maps core Audnexus fields", async () => {
		const metadata = await audibleProvider.getById("B0EXAMPLE1", {
			region: "us",
		});

		expect(metadata).toMatchObject({
			title: "Great Story",
			asin: "B0EXAMPLE1",
			publisher: { name: "Acme Audio" },
			publishedDate: "2024-05-01",
			duration: 90 * 60,
			audibleRating: 4.6,
		});
		expect(metadata?.description).toBe("A tale of tests");
		expect(metadata?.authors).toEqual([{ name: "Jane Doe", role: "Author" }]);
		expect(metadata?.narrators).toEqual([{ name: "Nora Reader" }]);
	});
});

describe("official Audible series fallback", () => {
	const product = {
		asin: "B0GSVCYC38",
		title: "[3巻] DanMachi 3",
		series: [{ title: "DanMachi", sequence: "3" }],
		product_images: { "500": "https://example.com/cover.jpg" },
	};
	test("fills missing Audnexus series without replacing rich metadata", async () => {
		fetchResponder = (url) =>
			Response.json(
				url.includes("audnex.us")
					? { ...AUDNEXUS_BOOK, asin: product.asin }
					: { product },
			);
		const result = await audibleProvider.getById(product.asin, {
			region: "jp",
		});
		expect(result?.series).toEqual({ name: "DanMachi", position: 3 });
		expect(result?.description).toBe("A tale of tests");
		expect(fetchCalls[1]).toContain(
			"api.audible.co.jp/1.0/catalog/products/B0GSVCYC38?",
		);
	});
	test("hydrates an exact ASIN absent from Audnexus and retains the search preview", async () => {
		fetchResponder = (url) =>
			url.includes("audnex.us")
				? new Response("", { status: 404 })
				: Response.json({ product });
		const [result] = await audibleProvider.search(
			{ title: product.asin },
			{ region: "jp" },
		);
		expect(result?.series).toEqual({ name: "DanMachi", position: 3 });
		expect(result?.asin).toBe(product.asin);
		expect(result?.previewCover).toBe("https://example.com/cover.jpg");
	});
	test("does not replace an existing primary series with a secondary catalog series", async () => {
		fetchResponder = () =>
			Response.json({
				...AUDNEXUS_BOOK,
				seriesPrimary: { name: "Umbrella", position: "27" },
			});
		expect((await audibleProvider.getById("B0EXAMPLE1"))?.series).toEqual({
			name: "Umbrella",
			position: 27,
		});
		expect(fetchCalls).toHaveLength(1);
	});
	test("rejects a substituted catalog ASIN", async () => {
		fetchResponder = (url) =>
			url.includes("audnex.us")
				? new Response("", { status: 404 })
				: Response.json({ product });
		expect(await audibleProvider.getById("B09HC42L8K")).toBeNull();
	});
	test("keeps a textual sequence unknown while retaining its official membership", async () => {
		fetchResponder = (url) =>
			url.includes("audnex.us")
				? Response.json(AUDNEXUS_BOOK)
				: Response.json({
						product: {
							...product,
							series: [{ title: "Oregairu", sequence: "結 1" }],
						},
					});
		expect((await audibleProvider.getById(product.asin))?.series).toEqual({
			name: "Oregairu",
			position: null,
		});
	});
	test("retains series in title search results", async () => {
		fetchResponder = () => Response.json({ products: [product] });
		expect(
			(await audibleProvider.search({ title: "DanMachi" }))[0]?.series,
		).toEqual({ name: "DanMachi", position: 3 });
	});
	test("preserves retryable failures instead of treating them as missing series", async () => {
		fetchResponder = (url) =>
			url.includes("audnex.us")
				? Response.json(AUDNEXUS_BOOK)
				: new Response("", { status: 429 });
		await expect(audibleProvider.getById(product.asin)).rejects.toThrow();
	});
});
