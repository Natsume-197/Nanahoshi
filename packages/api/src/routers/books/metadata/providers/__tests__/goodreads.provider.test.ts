import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

let goodreadsConfig: { enabled: boolean } = { enabled: true };

// Includes every provider-config getter so this mock doesn't break the other
// provider test files sharing the same Bun process.
mock.module("../../../../settings/settings.service", () => ({
	getGoodreadsConfig: () => Promise.resolve(goodreadsConfig),
	getAmazonConfig: () =>
		Promise.resolve({ domain: "co.jp", cookie: undefined, enabled: true }),
	getRanobedbConfig: () => Promise.resolve({ enabled: true }),
	getGoogleBooksConfig: () => Promise.resolve({ enabled: true }),
	getOpenLibraryConfig: () => Promise.resolve({ enabled: true }),
	getComicvineConfig: () =>
		Promise.resolve({ enabled: true, apiKey: "test-key" }),
	getHardcoverConfig: () =>
		Promise.resolve({ enabled: true, apiToken: "test-token" }),
}));

const { goodreadsProvider } = await import("../goodreads.provider");

const realFetch = globalThis.fetch;
let fetchCalls: { url: string; init?: RequestInit }[] = [];
let fetchHandler: (url: string, init?: RequestInit) => Response = () =>
	new Response("[]", { status: 200 });

afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	goodreadsConfig = { enabled: true };
	fetchCalls = [];
	globalThis.fetch = mock(
		(input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			fetchCalls.push({ url, init });
			return Promise.resolve(fetchHandler(url, init));
		},
	) as unknown as typeof fetch;
});

// ─── Fixtures ───────────────────────────────────────────

const GRAPHQL_BOOK = {
	data: {
		getBookByLegacyId: {
			title: "Mushoku Tensei: Jobless Reincarnation, Vol. 1",
			description: "Reborn in <b>another world</b>.",
			imageUrl: "https://images.gr-assets.com/books/123.jpg",
			primaryContributorEdge: { node: { name: "Rifujin na Magonote" } },
			secondaryContributorEdges: [{ node: { name: "Shirotaka" } }],
			bookSeries: [{ userPosition: "1", series: { title: "Mushoku Tensei" } }],
			bookGenres: [
				{ genre: { name: "Fantasy" } },
				{ genre: { name: "Light Novel" } },
			],
			details: {
				numPages: 280,
				publicationTime: 1558483200000,
				publisher: "Seven Seas",
				isbn: "1642750387",
				isbn13: "9781642750386",
				language: { name: "English" },
			},
		},
	},
};

const AUTOCOMPLETE = [
	{
		bookId: "44571043",
		title: "Mushoku Tensei: Jobless Reincarnation, Vol. 1",
		bookTitleBare: "Mushoku Tensei: Jobless Reincarnation, Vol. 1",
		author: { name: "Rifujin na Magonote" },
		imageUrl: "https://images.gr-assets.com/books/123._SX50_.jpg",
		bookUrl: "/book/show/44571043-mushoku-tensei",
	},
];

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

// ─── getMetadata ────────────────────────────────────────

describe("getMetadata", () => {
	test("returns empty when disabled for the org", async () => {
		goodreadsConfig = { enabled: false };
		const result = await goodreadsProvider.getMetadata({
			title: "test",
			serverId: "org-1",
		});
		expect(result).toEqual({});
		expect(fetchCalls.length).toBe(0);
	});

	test("resolves via autocomplete + GraphQL and maps fields", async () => {
		fetchHandler = (url) => {
			if (url.includes("auto_complete")) return jsonResponse(AUTOCOMPLETE);
			if (url.includes("appsync-api")) return jsonResponse(GRAPHQL_BOOK);
			return new Response("not found", { status: 404 });
		};
		const result = await goodreadsProvider.getMetadata({
			title: "Mushoku Tensei Jobless Reincarnation Vol. 1",
		});

		// Enrichment never overwrites the title
		expect(result.title).toBeUndefined();
		expect(result.description).toBe("Reborn in another world.");
		expect(result.publishedDate).toBe("2019-05-22");
		expect(result.languageCode).toBe("en");
		expect(result.pageCount).toBe(280);
		expect(result.isbn10).toBe("1642750387");
		expect(result.isbn13).toBe("9781642750386");
		expect(result.authors).toEqual([
			{ name: "Rifujin na Magonote", role: "Author" },
			{ name: "Shirotaka", role: "Author" },
		]);
		expect(result.publisher).toEqual({ name: "Seven Seas" });
		expect(result.series).toEqual({ name: "Mushoku Tensei", position: 1 });
		expect(result.genres).toEqual(["Fantasy", "Light Novel"]);
	});

	test("derives the missing ISBN-10 when only ISBN-13 is returned", async () => {
		const bookWithoutIsbn10 = structuredClone(GRAPHQL_BOOK);
		bookWithoutIsbn10.data.getBookByLegacyId.details.isbn =
			undefined as unknown as string;
		fetchHandler = (url) => {
			if (url.includes("auto_complete")) return jsonResponse(AUTOCOMPLETE);
			return jsonResponse(bookWithoutIsbn10);
		};
		const result = await goodreadsProvider.getMetadata({
			title: "Mushoku Tensei Jobless Reincarnation Vol. 1",
		});
		expect(result.isbn13).toBe("9781642750386");
		expect(result.isbn10).toBe("1642750387");
	});

	test("skips dissimilar autocomplete matches", async () => {
		fetchHandler = (url) => {
			if (url.includes("auto_complete")) {
				return jsonResponse([
					{ bookId: "1", bookTitleBare: "A Court of Thorns and Roses" },
				]);
			}
			return jsonResponse(GRAPHQL_BOOK);
		};
		const result = await goodreadsProvider.getMetadata({
			title: "完全に無関係な日本語タイトル",
		});
		expect(result).toEqual({});
		// GraphQL never consulted for a garbage match
		expect(fetchCalls.some((c) => c.url.includes("appsync-api"))).toBe(false);
	});

	test("resolves ISBN via redirect to the legacy id", async () => {
		fetchHandler = (url) => {
			if (url.includes("/book/isbn/")) {
				const response = new Response(null, { status: 200 });
				Object.defineProperty(response, "url", {
					value: "https://www.goodreads.com/book/show/44571043-mushoku-tensei",
				});
				return response;
			}
			if (url.includes("appsync-api")) return jsonResponse(GRAPHQL_BOOK);
			return new Response("not found", { status: 404 });
		};
		const result = await goodreadsProvider.getMetadata({
			isbn13: "9781642750386",
		});
		expect(result.isbn13).toBe("9781642750386");
		expect(result.publisher).toEqual({ name: "Seven Seas" });
	});

	test("fails soft on GraphQL errors", async () => {
		fetchHandler = (url) => {
			if (url.includes("auto_complete")) return jsonResponse(AUTOCOMPLETE);
			return jsonResponse({ errors: [{ message: "boom" }] });
		};
		const result = await goodreadsProvider.getMetadata({
			title: "Mushoku Tensei Jobless Reincarnation Vol. 1",
		});
		expect(result).toEqual({});
	});
});

// ─── search ─────────────────────────────────────────────

describe("search", () => {
	test("maps autocomplete entries to candidates", async () => {
		fetchHandler = (url) => {
			if (url.includes("auto_complete")) return jsonResponse(AUTOCOMPLETE);
			return new Response("not found", { status: 404 });
		};
		const candidates = await goodreadsProvider.search({
			title: "Mushoku Tensei",
		});

		expect(candidates.length).toBe(1);
		const candidate = candidates[0];
		expect(candidate?.provider).toBe("goodreads");
		expect(candidate?.providerId).toBe("44571043");
		expect(candidate?.title).toContain("Mushoku Tensei");
		expect(candidate?.authors).toEqual([{ name: "Rifujin na Magonote" }]);
		expect(candidate?.url).toBe(
			"https://www.goodreads.com/book/show/44571043-mushoku-tensei",
		);
	});

	test("sends the GraphQL API key header when applying by id", async () => {
		fetchHandler = () => jsonResponse(GRAPHQL_BOOK);
		await goodreadsProvider.getById("44571043", { keepRemoteCover: true });
		const call = fetchCalls.find((c) => c.url.includes("appsync-api"));
		expect(
			(call?.init?.headers as Record<string, string>)?.["x-api-key"],
		).toBeTruthy();
	});
});

// ─── getById ────────────────────────────────────────────

describe("getById", () => {
	test("keeps the title and remote cover for previews", async () => {
		fetchHandler = () => jsonResponse(GRAPHQL_BOOK);
		const result = await goodreadsProvider.getById("44571043", {
			keepRemoteCover: true,
		});
		expect(result?.title).toBe("Mushoku Tensei: Jobless Reincarnation, Vol. 1");
		expect(result?.cover).toBe("https://images.gr-assets.com/books/123.jpg");
	});

	test("returns null for non-numeric ids", async () => {
		const result = await goodreadsProvider.getById("not-a-number");
		expect(result).toBeNull();
	});
});
