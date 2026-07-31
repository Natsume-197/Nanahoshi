import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { COVER_STORE_MAX_DIM } from "../../../../../lib/cover-ladder";

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

const { itunesProvider } = await import("../itunes.provider");

afterAll(() => {
	globalThis.fetch = realFetch;
	globalThis.setTimeout = realSetTimeout;
});

const SEARCH_RESULT = {
	results: [
		{
			wrapperType: "audiobook",
			collectionId: 12345,
			collectionName: "Great Story",
			artistName: "Jane Doe & John Roe",
			description: "<p>A tale of <b>tests</b></p>",
			releaseDate: "2024-05-01T07:00:00Z",
			primaryGenreName: "Sci-Fi & Fantasy",
			artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
		},
	],
};

beforeEach(() => {
	fetchCalls.length = 0;
	fetchResponder = () =>
		new Response(JSON.stringify(SEARCH_RESULT), { status: 200 });
});

describe("itunes provider", () => {
	test("search builds the request with media=audiobook and mapped country", async () => {
		await itunesProvider.search(
			{ title: "Great Story", authors: [{ name: "Jane Doe" }] },
			{ region: "jp" },
		);

		const url = new URL(fetchCalls[0] ?? "");
		expect(url.origin + url.pathname).toBe("https://itunes.apple.com/search");
		expect(url.searchParams.get("term")).toBe("Great Story Jane Doe");
		expect(url.searchParams.get("media")).toBe("audiobook");
		expect(url.searchParams.get("country")).toBe("JP");
	});

	test("search maps iTunes fields to candidates", async () => {
		const [candidate] = await itunesProvider.search({ title: "Great Story" });

		expect(candidate).toMatchObject({
			provider: "itunes",
			providerId: "12345",
			title: "Great Story",
			publishedDate: "2024-05-01",
			genres: ["Sci-Fi & Fantasy"],
		});
		expect(candidate?.authors).toEqual([
			{ name: "Jane Doe", role: "Author" },
			{ name: "John Roe", role: "Author" },
		]);
		expect(candidate?.description).toBe("A tale of tests");
	});

	test("search returns [] without a title", async () => {
		const result = await itunesProvider.search({});
		expect(result).toEqual([]);
		expect(fetchCalls).toHaveLength(0);
	});

	test("search classifies a provider outage as retryable", async () => {
		fetchResponder = () => new Response(null, { status: 503 });

		await expect(
			itunesProvider.search({ title: "Great Story" }),
		).rejects.toMatchObject({
			name: "CatalogProviderError",
			kind: "transient",
			code: "server_error",
		});
	});

	test("getById looks up by id and requests full-size artwork", async () => {
		fetchResponder = (url) =>
			url.includes("itunes.apple.com")
				? new Response(JSON.stringify(SEARCH_RESULT), { status: 200 })
				: new Response(null, { status: 404 }); // artwork download fails → no cover

		const metadata = await itunesProvider.getById("12345", {
			region: "us",
			bookUuid: "uuid-1",
		});

		const lookupUrl = new URL(fetchCalls[0] ?? "");
		expect(lookupUrl.origin + lookupUrl.pathname).toBe(
			"https://itunes.apple.com/lookup",
		);
		expect(lookupUrl.searchParams.get("id")).toBe("12345");
		// Apple never upscales, so the request just has to clear our stored ceiling.
		expect(fetchCalls[1]).toContain(
			`${COVER_STORE_MAX_DIM}x${COVER_STORE_MAX_DIM}bb.jpg`,
		);
		expect(metadata).toMatchObject({ title: "Great Story" });
		expect(metadata?.cover).toBeUndefined();
	});

	test("getById returns null when nothing is found", async () => {
		fetchResponder = () =>
			new Response(JSON.stringify({ results: [] }), { status: 200 });

		const metadata = await itunesProvider.getById("999");
		expect(metadata).toBeNull();
	});
});
