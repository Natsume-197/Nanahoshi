import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const { bookmeterClient } = await import("../bookmeter.client");
const { bookmeterRepository } = await import("../bookmeter.repository");
const {
	getBookmeterStatus,
	linkBookmeter,
	normalizeTitle,
	resolveShelfEntries,
	syncUser,
} = await import("../bookmeter.service");
const { NotFoundError, BadRequestError } = await import("../../../errors");

type RemoteBook = Awaited<ReturnType<typeof bookmeterClient.fetchAllLists>>[0];

const remote = (over: Partial<RemoteBook>): RemoteBook => ({
	list: "read",
	title: "Title",
	author: null,
	amazonId: null,
	...over,
});

// Patch singletons in place (module mocks leak across test files in the
// shared bun process and would hide the real modules).
const spies = {
	getLink: spyOn(bookmeterRepository, "getLink"),
	setLink: spyOn(bookmeterRepository, "setLink"),
	recordSyncResult: spyOn(bookmeterRepository, "recordSyncResult"),
	getUserServerIds: spyOn(bookmeterRepository, "getUserServerIds"),
	findBooksByAmazonIds: spyOn(bookmeterRepository, "findBooksByAmazonIds"),
	findBooksByTitles: spyOn(bookmeterRepository, "findBooksByTitles"),
	insertShelfIfAbsent: spyOn(bookmeterRepository, "insertShelfIfAbsent"),
	validateUser: spyOn(bookmeterClient, "validateUser"),
	fetchAllLists: spyOn(bookmeterClient, "fetchAllLists"),
};

beforeEach(() => {
	for (const spy of Object.values(spies)) spy.mockReset();
	spies.getLink.mockResolvedValue({
		bookmeterUserId: "42",
		bookmeterLastSyncedAt: null,
		bookmeterLastSyncResult: null,
	});
	spies.setLink.mockResolvedValue();
	spies.recordSyncResult.mockResolvedValue();
	spies.getUserServerIds.mockResolvedValue(["server-1"]);
	spies.findBooksByAmazonIds.mockResolvedValue([]);
	spies.findBooksByTitles.mockResolvedValue([]);
	spies.insertShelfIfAbsent.mockResolvedValue(0);
	spies.validateUser.mockResolvedValue({ readCount: 1 });
	spies.fetchAllLists.mockResolvedValue([]);
});

afterAll(() => {
	for (const spy of Object.values(spies)) spy.mockRestore();
});

describe("normalizeTitle", () => {
	test("lowercases, NFKC-normalizes and collapses whitespace", () => {
		expect(normalizeTitle("  ＳＡＯ　１  ")).toBe("sao 1");
		expect(normalizeTitle("Some　 Book")).toBe("some book");
	});
});

describe("resolveShelfEntries", () => {
	test("maps bookmeter lists to shelf statuses via amazon id", () => {
		const books = [
			remote({ list: "read", amazonId: "A1" }),
			remote({ list: "reading", amazonId: "A2" }),
			remote({ list: "stacked", amazonId: "A3" }),
			remote({ list: "wish", amazonId: "A4" }),
		];
		const matches = [
			{ bookId: 1, amazonId: "A1" },
			{ bookId: 2, amazonId: "A2" },
			{ bookId: 3, amazonId: "A3" },
			{ bookId: 4, amazonId: "A4" },
		];
		expect(
			resolveShelfEntries(books, matches, []).sort(
				(a, b) => a.bookId - b.bookId,
			),
		).toEqual([
			{ bookId: 1, status: "completed" },
			{ bookId: 2, status: "reading" },
			{ bookId: 3, status: "backlog" },
			{ bookId: 4, status: "want_to_read" },
		]);
	});

	test("the strongest status wins when one book matches several entries", () => {
		const books = [
			remote({ list: "wish", amazonId: "A1" }),
			remote({ list: "read", amazonId: "A2" }),
		];
		// Both editions resolve to the same local book.
		const matches = [
			{ bookId: 7, amazonId: "A1" },
			{ bookId: 7, amazonId: "A2" },
		];
		expect(resolveShelfEntries(books, matches, [])).toEqual([
			{ bookId: 7, status: "completed" },
		]);
	});

	test("falls back to title matching only for books without amazon id", () => {
		const books = [
			remote({ list: "read", title: "無職転生 １" }),
			remote({ list: "wish", amazonId: "A9", title: "無職転生 １" }),
		];
		const titleMatches = [{ bookId: 5, title: normalizeTitle("無職転生　1") }];
		expect(resolveShelfEntries(books, [], titleMatches)).toEqual([
			{ bookId: 5, status: "completed" },
		]);
	});
});

describe("syncUser", () => {
	test("throws when no account is linked", async () => {
		spies.getLink.mockResolvedValue({
			bookmeterUserId: null,
			bookmeterLastSyncedAt: null,
			bookmeterLastSyncResult: null,
		});
		await expect(syncUser("u1")).rejects.toBeInstanceOf(NotFoundError);
	});

	test("matches, inserts and stamps the sync time", async () => {
		spies.fetchAllLists.mockResolvedValue([
			remote({ list: "read", amazonId: "A1" }),
			remote({ list: "reading", title: "no asin" }),
		]);
		spies.findBooksByAmazonIds.mockResolvedValue([
			{ bookId: 1, amazonId: "A1" },
		]);
		spies.findBooksByTitles.mockResolvedValue([
			{ bookId: 2, title: "no asin" },
		]);
		spies.insertShelfIfAbsent.mockResolvedValue(2);

		const result = await syncUser("u1");

		expect(spies.findBooksByAmazonIds).toHaveBeenCalledWith(
			["A1"],
			["server-1"],
		);
		expect(spies.findBooksByTitles).toHaveBeenCalledWith(
			["no asin"],
			["server-1"],
		);
		expect(spies.insertShelfIfAbsent).toHaveBeenCalledWith("u1", [
			{ bookId: 1, status: "completed" },
			{ bookId: 2, status: "reading" },
		]);
		expect(spies.recordSyncResult).toHaveBeenCalledWith(
			"u1",
			JSON.stringify({ fetched: 2, matched: 2, added: 2 }),
		);
		expect(result).toEqual({ fetched: 2, matched: 2, added: 2 });
	});

	test("still stamps the sync time when nothing matches", async () => {
		spies.fetchAllLists.mockResolvedValue([remote({ amazonId: "A1" })]);
		spies.getUserServerIds.mockResolvedValue([]);

		const result = await syncUser("u1");

		expect(spies.findBooksByAmazonIds).not.toHaveBeenCalled();
		expect(spies.insertShelfIfAbsent).toHaveBeenCalledWith("u1", []);
		expect(spies.recordSyncResult).toHaveBeenCalledWith(
			"u1",
			JSON.stringify({ fetched: 1, matched: 0, added: 0 }),
		);
		expect(result).toEqual({ fetched: 1, matched: 0, added: 0 });
	});
});

describe("linkBookmeter", () => {
	test("rejects unparsable input without hitting the network", async () => {
		await expect(linkBookmeter("u1", "garbage")).rejects.toBeInstanceOf(
			BadRequestError,
		);
		expect(spies.validateUser).not.toHaveBeenCalled();
	});

	test("validates, stores and returns the parsed id", async () => {
		const result = await linkBookmeter(
			"u1",
			"https://bookmeter.com/users/123456",
		);
		expect(spies.validateUser).toHaveBeenCalledWith("123456");
		expect(spies.setLink).toHaveBeenCalledWith("u1", "123456");
		expect(result).toEqual({ bookmeterUserId: "123456" });
	});
});

describe("getBookmeterStatus", () => {
	test("serializes the link for the client", async () => {
		const syncedAt = new Date("2026-07-20T10:00:00Z");
		spies.getLink.mockResolvedValue({
			bookmeterUserId: "42",
			bookmeterLastSyncedAt: syncedAt,
			bookmeterLastSyncResult: JSON.stringify({
				fetched: 10,
				matched: 5,
				added: 2,
			}),
		});
		expect(await getBookmeterStatus("u1")).toEqual({
			bookmeterUserId: "42",
			lastSyncedAt: syncedAt.toISOString(),
			lastSyncResult: { fetched: 10, matched: 5, added: 2 },
		});
	});

	test("returns nulls when unlinked", async () => {
		spies.getLink.mockResolvedValue(null);
		expect(await getBookmeterStatus("u1")).toEqual({
			bookmeterUserId: null,
			lastSyncedAt: null,
			lastSyncResult: null,
		});
	});

	test("tolerates a corrupt stored sync result", async () => {
		spies.getLink.mockResolvedValue({
			bookmeterUserId: "42",
			bookmeterLastSyncedAt: null,
			bookmeterLastSyncResult: "not-json",
		});
		expect((await getBookmeterStatus("u1")).lastSyncResult).toBeNull();
	});
});
