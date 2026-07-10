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
