import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import {
	BookmeterClient,
	BookmeterUserNotFoundError,
	parseAmazonId,
	parseBookmeterUserId,
} from "../bookmeter.client";

describe("parseBookmeterUserId", () => {
	test("accepts a raw numeric id", () => {
		expect(parseBookmeterUserId("123456")).toBe("123456");
		expect(parseBookmeterUserId("  42 ")).toBe("42");
	});

	test("accepts a profile URL", () => {
		expect(parseBookmeterUserId("https://bookmeter.com/users/123456")).toBe(
			"123456",
		);
		expect(
			parseBookmeterUserId("https://bookmeter.com/users/9876/books/read"),
		).toBe("9876");
	});

	test("rejects everything else", () => {
		expect(parseBookmeterUserId("not-a-user")).toBeNull();
		expect(parseBookmeterUserId("https://example.com/users/1")).toBeNull();
		expect(parseBookmeterUserId("12e4")).toBeNull();
	});
});

describe("parseAmazonId", () => {
	test("extracts ASIN from /dp/ URLs", () => {
		expect(
			parseAmazonId({
				description: "https://www.amazon.co.jp/dp/B00J8DVQPM/ref=xx",
			}),
		).toBe("B00J8DVQPM");
	});

	test("extracts ISBN-10 style ids and /gp/product/ URLs", () => {
		expect(
			parseAmazonId({ registration: "https://www.amazon.co.jp/dp/4041026156" }),
		).toBe("4041026156");
		expect(
			parseAmazonId({
				wish: "https://www.amazon.co.jp/gp/product/b00j8dvqpm?tag=x",
			}),
		).toBe("B00J8DVQPM");
	});

	test("scans all url values and ignores non-strings", () => {
		expect(
			parseAmazonId({
				a: 1,
				b: "https://bookmeter.com/books/1",
				c: "https://www.amazon.co.jp/dp/B000000001",
			}),
		).toBe("B000000001");
	});

	test("returns null when nothing matches", () => {
		expect(parseAmazonId(undefined)).toBeNull();
		expect(parseAmazonId({})).toBeNull();
		expect(parseAmazonId({ a: "https://www.amazon.co.jp/" })).toBeNull();
	});
});

const listResponse = (
	count: number,
	offset: number,
	titles: string[],
	limit = 20,
) =>
	new Response(
		JSON.stringify({
			metadata: { count, offset, limit },
			resources: titles.map((title) => ({
				book: {
					title,
					amazon_urls: {
						description: `https://www.amazon.co.jp/dp/B${title.padStart(9, "0")}`,
					},
					author: { name: "Author" },
				},
			})),
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);

describe("BookmeterClient", () => {
	const fetchSpy = spyOn(globalThis, "fetch");

	afterEach(() => fetchSpy.mockClear());
	// Restore the real fetch — spies on globals leak across test files otherwise.
	afterAll(() => fetchSpy.mockRestore());

	test("fetchList pages until metadata says it is done", async () => {
		fetchSpy
			.mockResolvedValueOnce(listResponse(3, 0, ["one", "two"], 2))
			.mockResolvedValueOnce(listResponse(3, 2, ["three"], 2));

		const client = new BookmeterClient();
		const books = await client.fetchList("42", "read");

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(String(fetchSpy.mock.calls[0][0])).toBe(
			"https://bookmeter.com/users/42/books/read.json?page=1",
		);
		expect(books.map((b) => b.title)).toEqual(["one", "two", "three"]);
		expect(books[0]).toMatchObject({
			list: "read",
			author: "Author",
			amazonId: "B000000ONE",
		});
	});

	test("fetchList stops on an empty page even if count disagrees", async () => {
		fetchSpy.mockResolvedValueOnce(listResponse(100, 0, []));

		const client = new BookmeterClient();
		const books = await client.fetchList("42", "read");
		expect(books).toEqual([]);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	test("validateUser maps 404 to BookmeterUserNotFoundError", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("not found", { status: 404 }));

		const client = new BookmeterClient();
		await expect(client.validateUser("42")).rejects.toBeInstanceOf(
			BookmeterUserNotFoundError,
		);
	});

	test("fetchAllLists tolerates one failing list", async () => {
		fetchSpy.mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes("/read.json")) return listResponse(1, 0, ["kept"]);
			if (url.includes("/reading.json"))
				return new Response("boom", { status: 500 });
			return listResponse(0, 0, []);
		});

		const client = new BookmeterClient();
		const books = await client.fetchAllLists("42");
		expect(books.map((b) => b.title)).toEqual(["kept"]);
	});

	test("fetchAllLists rethrows user-not-found immediately", async () => {
		fetchSpy.mockResolvedValue(new Response("not found", { status: 404 }));

		const client = new BookmeterClient();
		await expect(client.fetchAllLists("42")).rejects.toBeInstanceOf(
			BookmeterUserNotFoundError,
		);
	});
});
