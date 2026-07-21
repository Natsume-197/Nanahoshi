import { beforeEach, describe, expect, mock, test } from "bun:test";

const rename = mock(() =>
	Promise.resolve<"ok" | "not_found" | "conflict">("ok"),
);
const getIdByUuid = mock(() => Promise.resolve<number | null>(17));
const getLinkedBookIds = mock(() => Promise.resolve([101, 102]));
const enqueueSeriesSync = mock(() => Promise.resolve());
const enqueueSearchSyncBulk = mock(() => Promise.resolve());
let searchSyncRequired = true;

mock.module("../series.repository", () => ({
	seriesRepository: { rename, getIdByUuid, getLinkedBookIds },
}));

mock.module("../../../infrastructure/search/search-sync.service", () => ({
	enqueueSeriesSync,
	enqueueSearchSyncBulk,
	requiresSearchSync: () => searchSyncRequired,
}));

const { renameSeries } = await import("../series.service");

describe("renameSeries", () => {
	beforeEach(() => {
		rename.mockClear();
		getIdByUuid.mockClear();
		getLinkedBookIds.mockClear();
		enqueueSeriesSync.mockClear();
		enqueueSearchSyncBulk.mockClear();
		searchSyncRequired = true;
		rename.mockImplementation(() => Promise.resolve("ok"));
		getIdByUuid.mockImplementation(() => Promise.resolve(17));
		getLinkedBookIds.mockImplementation(() => Promise.resolve([101, 102]));
	});

	test("syncs the entity and every linked item after a rename", async () => {
		const result = await renameSeries({
			uuid: "series-uuid",
			serverId: "server-1",
			name: "New name",
		});

		expect(result).toBe("ok");
		expect(enqueueSeriesSync).toHaveBeenCalledWith(17, {
			deduplicate: false,
		});
		expect(enqueueSearchSyncBulk).toHaveBeenCalledWith([101, 102], "update");
	});

	test("does not enqueue anything when the rename is rejected", async () => {
		rename.mockImplementation(() => Promise.resolve("conflict"));

		expect(
			await renameSeries({
				uuid: "series-uuid",
				serverId: "server-1",
				name: "Taken",
			}),
		).toBe("conflict");
		expect(getIdByUuid).not.toHaveBeenCalled();
		expect(enqueueSeriesSync).not.toHaveBeenCalled();
		expect(enqueueSearchSyncBulk).not.toHaveBeenCalled();
	});

	test("skips search lookups for a live-database provider", async () => {
		searchSyncRequired = false;

		expect(
			await renameSeries({
				uuid: "series-uuid",
				serverId: "server-1",
				name: "New name",
			}),
		).toBe("ok");
		expect(getIdByUuid).not.toHaveBeenCalled();
		expect(getLinkedBookIds).not.toHaveBeenCalled();
		expect(enqueueSeriesSync).not.toHaveBeenCalled();
		expect(enqueueSearchSyncBulk).not.toHaveBeenCalled();
	});
});
