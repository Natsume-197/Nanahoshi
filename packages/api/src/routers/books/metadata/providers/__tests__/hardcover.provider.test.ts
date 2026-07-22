import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

let hardcoverConfig: { enabled: boolean; apiToken?: string } = {
	enabled: true,
	apiToken: "test-token",
};

// Includes every provider-config getter so this mock doesn't break the other
// provider test files sharing the same Bun process.
mock.module("../../../../settings/settings.service", () => ({
	getHardcoverConfig: () => Promise.resolve(hardcoverConfig),
	getAmazonConfig: () =>
		Promise.resolve({ domain: "co.jp", cookie: undefined, enabled: true }),
	getRanobedbConfig: () => Promise.resolve({ enabled: true }),
	getGoogleBooksConfig: () => Promise.resolve({ enabled: true }),
	getOpenLibraryConfig: () => Promise.resolve({ enabled: true }),
	getGoodreadsConfig: () => Promise.resolve({ enabled: true }),
	getComicvineConfig: () =>
		Promise.resolve({ enabled: true, apiKey: "test-key" }),
}));

const { hardcoverProvider } = await import("../hardcover.provider");

const realFetch = globalThis.fetch;
let fetchCalls: { url: string; body: Record<string, unknown> }[] = [];
let graphqlHandler: (body: Record<string, unknown>) => unknown = () => ({
	data: {},
});

afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	hardcoverConfig = { enabled: true, apiToken: "test-token" };
	fetchCalls = [];
	graphqlHandler = () => ({ data: {} });
	globalThis.fetch = mock(
		(input: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as Record<
				string,
				unknown
			>;
			fetchCalls.push({ url: String(input), body });
			return Promise.resolve(
				new Response(JSON.stringify(graphqlHandler(body)), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		},
	) as unknown as typeof fetch;
});

// ─── Fixtures ───────────────────────────────────────────

const BOOK = {
	id: 424242,
	slug: "the-name-of-the-wind",
	title: "The Name of the Wind",
	subtitle: "Kingkiller Chronicle #1",
	description: "A young man <i>grows up</i>.",
	cached_contributors: [{ author: { name: "Patrick Rothfuss" } }],
	featured_book_series: {
		position: 1,
		series: { name: "The Kingkiller Chronicle" },
	},
	release_date: "2007-03-27",
	pages: 662,
	image: { url: "https://assets.hardcover.app/book.jpg" },
	cached_tags: {
		Genre: [{ tag: "Fantasy" }, { tag: "Fiction" }],
		Tag: [{ tag: "magic" }],
		Mood: [{ tag: "adventurous" }],
	},
	editions: [
		{
			title: "The Name of the Wind",
			pages: 662,
			release_date: "2007-03-27",
			image: { url: "https://assets.hardcover.app/edition.jpg" },
			publisher: { name: "DAW Books" },
			isbn_10: "075640407X",
			isbn_13: "9780756404079",
			language: { code2: "en" },
		},
		{ title: "Bare edition" },
	],
};

const SEARCH_RESULTS = {
	data: {
		search: {
			results: {
				hits: [
					{
						document: {
							id: "424242",
							title: "The Name of the Wind",
							author_names: ["Patrick Rothfuss"],
							featured_series: {
								position: 1,
								series: { name: "The Kingkiller Chronicle" },
							},
							release_date: "2007-03-27",
							image: { url: "https://assets.hardcover.app/book.jpg" },
							slug: "the-name-of-the-wind",
						},
					},
				],
			},
		},
	},
};

// ─── getMetadata ────────────────────────────────────────

describe("getMetadata", () => {
	test("returns empty without an API token", async () => {
		hardcoverConfig = { enabled: true };
		const { metadata: result } = await hardcoverProvider.getMetadata({
			title: "test",
			serverId: "org-1",
		});
		expect(result).toEqual({});
		expect(fetchCalls.length).toBe(0);
	});

	test("resolves by ISBN and maps the richest edition", async () => {
		graphqlHandler = (body) => {
			if (String(body.query).includes("BookByIsbn")) {
				return { data: { books: [BOOK] } };
			}
			return { data: {} };
		};
		const { metadata: result } = await hardcoverProvider.getMetadata({
			isbn13: "9780756404079",
			title: "existing",
			serverId: "org-1",
		});

		// Enrichment never overwrites the title
		expect(result.title).toBeUndefined();
		expect(result.subtitle).toBe("Kingkiller Chronicle #1");
		expect(result.description).toBe("A young man grows up.");
		expect(result.publishedDate).toBe("2007-03-27");
		expect(result.languageCode).toBe("en");
		expect(result.pageCount).toBe(662);
		expect(result.isbn10).toBe("075640407X");
		expect(result.isbn13).toBe("9780756404079");
		expect(result.authors).toEqual([
			{ name: "Patrick Rothfuss", role: "Author" },
		]);
		expect(result.publisher).toEqual({ name: "DAW Books" });
		expect(result.series).toEqual({
			name: "The Kingkiller Chronicle",
			position: 1,
		});
		expect(result.genres).toEqual(["Fantasy", "Fiction"]);
		expect(result.tags).toEqual(["magic"]);
	});

	test("derives the missing ISBN-10 when the edition only has ISBN-13", async () => {
		const bookWithoutIsbn10 = structuredClone(BOOK);
		const richEdition = bookWithoutIsbn10.editions[0] as {
			isbn_10?: string;
		};
		richEdition.isbn_10 = undefined;
		graphqlHandler = () => ({ data: { books: [bookWithoutIsbn10] } });
		const { metadata: result } = await hardcoverProvider.getMetadata({
			isbn13: "9780756404079",
			serverId: "org-1",
		});
		expect(result.isbn13).toBe("9780756404079");
		expect(result.isbn10).toBe("075640407X");
	});

	test("isAvailable requires an API token", async () => {
		expect(await hardcoverProvider.isAvailable("org-1")).toBe(true);
		hardcoverConfig = { enabled: true };
		expect(await hardcoverProvider.isAvailable("org-1")).toBe(false);
		hardcoverConfig = { enabled: false, apiToken: "test-token" };
		expect(await hardcoverProvider.isAvailable("org-1")).toBe(false);
		expect(await hardcoverProvider.isAvailable(null)).toBe(false);
	});

	test("filters out documents by unrelated authors when the author is known", async () => {
		graphqlHandler = (body) => {
			const query = String(body.query);
			if (query.includes("BookSearch")) {
				return {
					data: {
						search: {
							results: {
								hits: [
									{
										document: {
											id: "111",
											title: "The Name of the Wind",
											author_names: ["Somebody Else"],
										},
									},
									{
										document: {
											id: "424242",
											title: "The Name of the Wind",
											author_names: ["Patrick Rothfuss"],
										},
									},
								],
							},
						},
					},
				};
			}
			if (query.includes("BookById")) {
				return { data: { books_by_pk: BOOK } };
			}
			return { data: {} };
		};

		await hardcoverProvider.getMetadata({
			title: "The Name of the Wind",
			authors: [{ name: "Patrick Rothfuss", role: "Author" }],
			serverId: "org-1",
		});

		// The by-id fetch targets the author-matching document, not the first hit.
		const byIdCall = fetchCalls.find((c) =>
			String(c.body.query).includes("BookById"),
		);
		expect(byIdCall?.body.variables).toEqual({ id: 424242 });
	});

	test("falls back to search + fetch by id", async () => {
		graphqlHandler = (body) => {
			const query = String(body.query);
			if (query.includes("BookSearch")) return SEARCH_RESULTS;
			if (query.includes("BookById")) {
				return { data: { books_by_pk: BOOK } };
			}
			return { data: {} };
		};
		const { metadata: result } = await hardcoverProvider.getMetadata({
			title: "The Name of the Wind",
			serverId: "org-1",
		});
		expect(result.isbn13).toBe("9780756404079");
		expect(fetchCalls.length).toBe(2);
	});

	test("sends the bearer token", async () => {
		await hardcoverProvider.getMetadata({
			title: "test",
			serverId: "org-1",
		});
		// Headers travel through fetch init; assert via the mock's call
		const init = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
			.calls[0]?.[1] as RequestInit;
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer test-token",
		);
	});

	test("fails soft on permanent GraphQL errors", async () => {
		graphqlHandler = () => ({ errors: [{ message: "field not found" }] });
		const { metadata: result } = await hardcoverProvider.getMetadata({
			title: "test",
			serverId: "org-1",
		});
		expect(result).toEqual({});
	});

	test("throws ProviderTransientError when Hardcover reports throttling", async () => {
		graphqlHandler = () => ({ errors: [{ message: "Throttled" }] });
		await expect(
			hardcoverProvider.getMetadata({ title: "test", serverId: "org-1" }),
		).rejects.toThrow(/throttling/);
	});
});

// ─── search ─────────────────────────────────────────────

describe("search", () => {
	test("maps search hits to candidates", async () => {
		graphqlHandler = () => SEARCH_RESULTS;
		const candidates = await hardcoverProvider.search(
			{ title: "The Name of the Wind" },
			{ serverId: "org-1" },
		);

		expect(candidates.length).toBe(1);
		const candidate = candidates[0];
		expect(candidate?.provider).toBe("hardcover");
		expect(candidate?.providerId).toBe("424242");
		expect(candidate?.title).toBe("The Name of the Wind");
		expect(candidate?.authors).toEqual([{ name: "Patrick Rothfuss" }]);
		expect(candidate?.series).toEqual({
			name: "The Kingkiller Chronicle",
			position: 1,
		});
		expect(candidate?.url).toBe(
			"https://hardcover.app/books/the-name-of-the-wind",
		);
	});

	test("returns empty when disabled", async () => {
		hardcoverConfig = { enabled: false, apiToken: "test-token" };
		const candidates = await hardcoverProvider.search(
			{ title: "test" },
			{ serverId: "org-1" },
		);
		expect(candidates).toEqual([]);
	});
});

// ─── getById ────────────────────────────────────────────

describe("getById", () => {
	test("fetches books_by_pk and keeps title + remote cover for previews", async () => {
		graphqlHandler = () => ({ data: { books_by_pk: BOOK } });
		const result = await hardcoverProvider.getById("424242", {
			serverId: "org-1",
			keepRemoteCover: true,
		});
		expect(fetchCalls[0]?.body.variables).toEqual({ id: 424242 });
		expect(result?.title).toBe("The Name of the Wind");
		expect(result?.cover).toBe("https://assets.hardcover.app/edition.jpg");
	});

	test("returns null for non-numeric ids", async () => {
		const result = await hardcoverProvider.getById("not-a-number", {
			serverId: "org-1",
		});
		expect(result).toBeNull();
	});
});
