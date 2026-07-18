import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

let openLibraryConfig: { enabled: boolean } = { enabled: true };

// Includes every provider-config getter so this mock doesn't break the other
// provider test files sharing the same Bun process.
mock.module("../../../../settings/settings.service", () => ({
	getOpenLibraryConfig: () => Promise.resolve(openLibraryConfig),
	getAmazonConfig: () =>
		Promise.resolve({ domain: "co.jp", cookie: undefined, enabled: true }),
	getRanobedbConfig: () => Promise.resolve({ enabled: true }),
	getGoogleBooksConfig: () => Promise.resolve({ enabled: true }),
	getGoodreadsConfig: () => Promise.resolve({ enabled: true }),
	getComicvineConfig: () =>
		Promise.resolve({ enabled: true, apiKey: "test-key" }),
	getHardcoverConfig: () =>
		Promise.resolve({ enabled: true, apiToken: "test-token" }),
}));

const { openlibraryProvider } = await import("../openlibrary.provider");

const realFetch = globalThis.fetch;
let fetchCalls: { url: string; headers: Record<string, string> }[] = [];
let routes: Record<string, unknown> = {};

function installFetch() {
	globalThis.fetch = mock(
		(input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			fetchCalls.push({
				url,
				headers: (init?.headers ?? {}) as Record<string, string>,
			});
			const match = Object.entries(routes).find(([prefix]) =>
				url.includes(prefix),
			);
			if (!match) {
				return Promise.resolve(new Response("not found", { status: 404 }));
			}
			return Promise.resolve(
				new Response(JSON.stringify(match[1]), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		},
	) as unknown as typeof fetch;
}

afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	openLibraryConfig = { enabled: true };
	fetchCalls = [];
	routes = {};
	installFetch();
});

// ─── Fixtures ───────────────────────────────────────────

const EDITION = {
	key: "/books/OL456M",
	title: "The Hobbit",
	subtitle: "Or There and Back Again",
	publishers: ["Allen & Unwin"],
	publish_date: "Jun 15, 1937",
	number_of_pages: 310,
	isbn_10: ["0048231886"],
	isbn_13: ["9780048231888"],
	covers: [1234],
	works: [{ key: "/works/OL123W" }],
	languages: [{ key: "/languages/eng" }],
	authors: [{ key: "/authors/OL789A" }],
};

const WORK = {
	key: "/works/OL123W",
	title: "The Hobbit",
	description: { value: "A hobbit goes on an <i>adventure</i>." },
	subjects: ["Fantasy", "Adventure", "Middle Earth"],
};

const SEARCH_DOC = {
	key: "/works/OL123W",
	title: "The Hobbit",
	author_name: ["J. R. R. Tolkien"],
	first_publish_year: 1937,
	cover_i: 1234,
};

// ─── getMetadata ────────────────────────────────────────

describe("getMetadata", () => {
	test("returns empty when disabled for the org", async () => {
		openLibraryConfig = { enabled: false };
		const result = await openlibraryProvider.getMetadata({
			title: "test",
			serverId: "org-1",
		});
		expect(result).toEqual({});
		expect(fetchCalls.length).toBe(0);
	});

	test("resolves by ISBN: edition + work merge", async () => {
		routes = {
			"/isbn/9780048231888.json": EDITION,
			"/works/OL123W.json": WORK,
			"/authors/OL789A.json": { name: "J. R. R. Tolkien" },
		};
		const result = await openlibraryProvider.getMetadata({
			isbn13: "9780048231888",
			title: "existing",
		});

		// Enrichment never overwrites the title
		expect(result.title).toBeUndefined();
		expect(result.subtitle).toBe("Or There and Back Again");
		expect(result.description).toBe("A hobbit goes on an adventure.");
		expect(result.publishedDate).toBe("1937-06-15");
		expect(result.languageCode).toBe("en");
		expect(result.pageCount).toBe(310);
		expect(result.isbn10).toBe("0048231886");
		expect(result.isbn13).toBe("9780048231888");
		expect(result.authors).toEqual([
			{ name: "J. R. R. Tolkien", role: "Author" },
		]);
		expect(result.publisher).toEqual({ name: "Allen & Unwin" });
		expect(result.genres).toEqual(["Fantasy", "Adventure", "Middle Earth"]);
	});

	test("derives the missing ISBN-13 when the edition only has ISBN-10", async () => {
		routes = {
			"/isbn/4048915649.json": {
				...EDITION,
				isbn_10: ["4048915649"],
				isbn_13: undefined,
			},
			"/works/OL123W.json": WORK,
			"/authors/OL789A.json": { name: "J. R. R. Tolkien" },
		};
		const result = await openlibraryProvider.getMetadata({
			isbn10: "4048915649",
		});
		expect(result.isbn10).toBe("4048915649");
		expect(result.isbn13).toBe("9784048915649");
	});

	test("falls back to title search and resolves the work", async () => {
		routes = {
			"/search.json": { docs: [SEARCH_DOC] },
			"/works/OL123W.json": WORK,
			"/works/OL123W/editions.json": { entries: [EDITION] },
			"/authors/OL789A.json": { name: "J. R. R. Tolkien" },
		};
		const result = await openlibraryProvider.getMetadata({
			title: "The Hobbit",
		});
		expect(fetchCalls[0]?.url).toContain("/search.json");
		expect(result.isbn13).toBe("9780048231888");
		expect(result.description).toBe("A hobbit goes on an adventure.");
	});

	test("sends the descriptive User-Agent on every request", async () => {
		routes = { "/search.json": { docs: [] } };
		await openlibraryProvider.getMetadata({ title: "test" });
		expect(fetchCalls[0]?.headers["User-Agent"]).toContain("Nanahoshi");
	});

	test("fails soft on network failure", async () => {
		globalThis.fetch = mock(() => {
			throw new Error("network down");
		}) as unknown as typeof fetch;
		const result = await openlibraryProvider.getMetadata({ title: "test" });
		expect(result).toEqual({});
	});
});

// ─── search ─────────────────────────────────────────────

describe("search", () => {
	test("maps search docs to candidates", async () => {
		routes = { "/search.json": { docs: [SEARCH_DOC] } };
		const candidates = await openlibraryProvider.search({
			title: "The Hobbit",
			author: "Tolkien",
		});

		expect(candidates.length).toBe(1);
		const candidate = candidates[0];
		expect(candidate?.provider).toBe("openlibrary");
		expect(candidate?.providerId).toBe("works/OL123W");
		expect(candidate?.title).toBe("The Hobbit");
		expect(candidate?.authors).toEqual([{ name: "J. R. R. Tolkien" }]);
		expect(candidate?.publishedDate).toBe("1937-01-01");
		expect(candidate?.previewCover).toContain(
			"covers.openlibrary.org/b/id/1234",
		);
		expect(candidate?.url).toBe("https://openlibrary.org/works/OL123W");
	});

	test("returns empty when disabled", async () => {
		openLibraryConfig = { enabled: false };
		const candidates = await openlibraryProvider.search(
			{ title: "The Hobbit" },
			{ serverId: "org-1" },
		);
		expect(candidates).toEqual([]);
	});
});

// ─── getById ────────────────────────────────────────────

describe("getById", () => {
	test("dispatches books/… ids to the edition endpoint", async () => {
		routes = {
			"/books/OL456M.json": EDITION,
			"/works/OL123W.json": WORK,
			"/authors/OL789A.json": { name: "J. R. R. Tolkien" },
		};
		const result = await openlibraryProvider.getById("books/OL456M", {
			keepRemoteCover: true,
		});
		expect(fetchCalls[0]?.url).toContain("/books/OL456M.json");
		expect(result?.title).toBe("The Hobbit");
		expect(result?.cover).toContain("covers.openlibrary.org/b/id/1234");
	});

	test("dispatches works/… ids to work + best edition", async () => {
		const editionNoIsbn = {
			...EDITION,
			isbn_13: undefined,
			isbn_10: undefined,
		};
		routes = {
			"/works/OL123W.json": WORK,
			"/works/OL123W/editions.json": { entries: [editionNoIsbn, EDITION] },
			"/authors/OL789A.json": { name: "J. R. R. Tolkien" },
		};
		const result = await openlibraryProvider.getById("works/OL123W", {
			keepRemoteCover: true,
		});
		// Prefers the edition carrying an ISBN-13
		expect(result?.isbn13).toBe("9780048231888");
	});

	test("handles string descriptions", async () => {
		routes = {
			"/books/OL456M.json": { ...EDITION, description: "Plain string." },
			"/works/OL123W.json": { ...WORK, description: undefined },
			"/authors/OL789A.json": { name: "J. R. R. Tolkien" },
		};
		const result = await openlibraryProvider.getById("books/OL456M");
		expect(result?.description).toBe("Plain string.");
	});

	test("returns null for unknown id shapes", async () => {
		const result = await openlibraryProvider.getById("garbage-id");
		expect(result).toBeNull();
	});
});
