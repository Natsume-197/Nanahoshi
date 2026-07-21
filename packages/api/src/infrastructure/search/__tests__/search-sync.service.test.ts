import { beforeEach, describe, expect, mock, test } from "bun:test";

const add = mock(() => Promise.resolve());
const addBulk = mock(() => Promise.resolve([]));
let requiresSync = true;

mock.module("../../queue/queues/search-sync.queue", () => ({
	searchSyncQueue: { add, addBulk },
}));

mock.module("../search.factory", () => ({
	getSearchProvider: () => ({ requiresSync: () => requiresSync }),
}));

const { enqueueSearchSyncBulk, enqueueSeriesSync } = await import(
	"../search-sync.service"
);

describe("enqueueSearchSyncBulk", () => {
	beforeEach(() => {
		add.mockClear();
		addBulk.mockClear();
		requiresSync = true;
	});

	test("deduplicates ids and submits bounded batches", async () => {
		const ids = [...Array.from({ length: 502 }, (_, i) => i + 1), 1];

		await enqueueSearchSyncBulk(ids, "update");

		expect(addBulk).toHaveBeenCalledTimes(2);
		expect(addBulk.mock.calls[0]?.[0]).toHaveLength(500);
		expect(addBulk.mock.calls[1]?.[0]).toHaveLength(2);
		expect(addBulk.mock.calls[0]?.[0]?.[0]).toMatchObject({
			name: "sync-update",
			data: { bookId: 1, action: "update" },
			opts: { attempts: 5 },
		});
		expect(addBulk.mock.calls[0]?.[0]?.[0]?.opts).not.toHaveProperty("jobId");
	});

	test("is a no-op for a live-database provider", async () => {
		requiresSync = false;

		await enqueueSearchSyncBulk([1, 2], "update");

		expect(addBulk).not.toHaveBeenCalled();
	});

	test("can force an entity refresh behind an already-active sync", async () => {
		await enqueueSeriesSync(17, { deduplicate: false });

		expect(add).toHaveBeenCalledTimes(1);
		expect(add.mock.calls[0]?.[0]).toBe("sync-series");
		expect(add.mock.calls[0]?.[1]).toEqual({ seriesId: 17 });
		expect(add.mock.calls[0]?.[2]).not.toHaveProperty("jobId");
	});
});
