import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────

let comicvineConfig: { enabled: boolean; apiKey?: string } = {
	enabled: true,
	apiKey: "test-key",
};

// Includes every provider-config getter so this mock doesn't break the other
// provider test files sharing the same Bun process.
mock.module("../../../../settings/settings.service", () => ({
	getComicvineConfig: () => Promise.resolve(comicvineConfig),
	getAmazonConfig: () =>
		Promise.resolve({ domain: "co.jp", cookie: undefined, enabled: true }),
	getRanobedbConfig: () => Promise.resolve({ enabled: true }),
	getGoogleBooksConfig: () => Promise.resolve({ enabled: true }),
	getOpenLibraryConfig: () => Promise.resolve({ enabled: true }),
	getGoodreadsConfig: () => Promise.resolve({ enabled: true }),
	getHardcoverConfig: () =>
		Promise.resolve({ enabled: true, apiToken: "test-token" }),
}));

const { comicvineProvider } = await import("../comicvine.provider");

const realFetch = globalThis.fetch;
let fetchCalls: { url: string; init?: RequestInit }[] = [];
let fetchHandler: (url: string) => unknown = () => ({
	status_code: 1,
	results: [],
});

afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	comicvineConfig = { enabled: true, apiKey: "test-key" };
	fetchCalls = [];
	fetchHandler = () => ({ status_code: 1, results: [] });
	globalThis.fetch = mock(
		(input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			fetchCalls.push({ url, init });
			const body = fetchHandler(url);
			if (body instanceof Response) return Promise.resolve(body);
			return Promise.resolve(
				new Response(JSON.stringify(body), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		},
	) as unknown as typeof fetch;
});

// ─── Fixtures ───────────────────────────────────────────

const VOLUME_RESULT = {
	id: 12345,
	name: "Saga",
	resource_type: "volume",
	start_year: "2012",
	count_of_issues: 66,
	description: "<p>Two soldiers from <b>opposite sides</b>.</p>",
	image: { original_url: "https://comicvine.gamespot.com/a/saga.jpg" },
	site_detail_url: "https://comicvine.gamespot.com/saga/4050-12345/",
	publisher: { name: "Image Comics" },
};

const ISSUE_RESULT = {
	id: 67890,
	name: "Chapter One",
	resource_type: "issue",
	issue_number: "1",
	cover_date: "2012-03-14",
	description: "<p>The first chapter.</p>",
	image: { original_url: "https://comicvine.gamespot.com/a/saga1.jpg" },
	site_detail_url: "https://comicvine.gamespot.com/saga-1/4000-67890/",
	volume: { id: 12345, name: "Saga" },
	person_credits: [
		{ name: "Brian K. Vaughan", role: "writer" },
		{ name: "Fiona Staples", role: "artist" },
	],
};

// ─── getMetadata ────────────────────────────────────────

describe("getMetadata", () => {
	test("returns empty without an API key", async () => {
		comicvineConfig = { enabled: true };
		const result = await comicvineProvider.getMetadata({
			title: "Saga",
			serverId: "org-1",
		});
		expect(result).toEqual({});
		expect(fetchCalls.length).toBe(0);
	});

	test("returns empty without a serverId (no key available)", async () => {
		const result = await comicvineProvider.getMetadata({ title: "Saga" });
		expect(result).toEqual({});
		expect(fetchCalls.length).toBe(0);
	});

	test("searches then refetches the typed resource", async () => {
		fetchHandler = (url) => {
			if (url.includes("/search/")) {
				return { status_code: 1, results: [VOLUME_RESULT] };
			}
			if (url.includes("/volume/4050-12345/")) {
				return { status_code: 1, results: VOLUME_RESULT };
			}
			return new Response("not found", { status: 404 });
		};
		const result = await comicvineProvider.getMetadata({
			title: "Saga",
			serverId: "org-1",
		});

		expect(fetchCalls[0]?.url).toContain("/search/");
		expect(fetchCalls[0]?.url).toContain("api_key=test-key");
		expect(fetchCalls[1]?.url).toContain("/volume/4050-12345/");
		// Enrichment never overwrites the title
		expect(result.title).toBeUndefined();
		expect(result.description).toBe("Two soldiers from opposite sides.");
		expect(result.publishedDate).toBe("2012-01-01");
		expect(result.publisher).toEqual({ name: "Image Comics" });
	});

	test("sends a descriptive User-Agent", async () => {
		await comicvineProvider.getMetadata({ title: "Saga", serverId: "org-1" });
		const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
		expect(headers["User-Agent"]).toContain("Nanahoshi");
	});

	test("fails soft on Comicvine API errors", async () => {
		fetchHandler = () => ({ status_code: 100, error: "Invalid API Key" });
		const result = await comicvineProvider.getMetadata({
			title: "Saga",
			serverId: "org-1",
		});
		expect(result).toEqual({});
	});
});

// ─── search ─────────────────────────────────────────────

describe("search", () => {
	test("maps volumes and issues to candidates with typed ids", async () => {
		fetchHandler = () => ({
			status_code: 1,
			results: [VOLUME_RESULT, ISSUE_RESULT],
		});
		const candidates = await comicvineProvider.search(
			{ title: "Saga" },
			{ serverId: "org-1" },
		);

		expect(candidates.length).toBe(2);
		const volume = candidates.find((c) => c.providerId === "4050-12345");
		const issue = candidates.find((c) => c.providerId === "4000-67890");
		expect(volume?.title).toBe("Saga");
		expect(volume?.publishedDate).toBe("2012-01-01");
		expect(issue?.title).toBe("Chapter One");
		expect(issue?.series).toEqual({ name: "Saga", position: 1 });
		expect(issue?.publishedDate).toBe("2012-03-14");
	});
});

// ─── getById ────────────────────────────────────────────

describe("getById", () => {
	test("maps an issue with credits and series position", async () => {
		fetchHandler = () => ({ status_code: 1, results: ISSUE_RESULT });
		const result = await comicvineProvider.getById("4000-67890", {
			serverId: "org-1",
			keepRemoteCover: true,
		});

		expect(fetchCalls[0]?.url).toContain("/issue/4000-67890/");
		expect(result?.title).toBe("Chapter One");
		expect(result?.authors).toEqual([
			{ name: "Brian K. Vaughan", role: "writer" },
			{ name: "Fiona Staples", role: "artist" },
		]);
		expect(result?.series).toEqual({ name: "Saga", position: 1 });
		expect(result?.cover).toBe("https://comicvine.gamespot.com/a/saga1.jpg");
	});

	test("returns null for unknown id prefixes", async () => {
		const result = await comicvineProvider.getById("9999-1", {
			serverId: "org-1",
		});
		expect(result).toBeNull();
	});
});
