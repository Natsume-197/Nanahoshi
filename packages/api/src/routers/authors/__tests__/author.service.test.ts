import { beforeEach, describe, expect, mock, test } from "bun:test";

const rename = mock(() =>
	Promise.resolve<"ok" | "not_found" | "conflict">("ok"),
);
const getIdByUuid = mock(() => Promise.resolve<number | null>(23));
const getLinkedBookIds = mock(() => Promise.resolve([201, 202]));
const enqueueAuthorSync = mock(() => Promise.resolve());
const enqueueSearchSyncBulk = mock(() => Promise.resolve());
let searchSyncRequired = true;

mock.module("../author.repository", () => ({
	authorRepository: { rename, getIdByUuid, getLinkedBookIds },
}));

mock.module("../../../infrastructure/search/search-sync.service", () => ({
	enqueueAuthorSync,
	enqueueSearchSyncBulk,
	requiresSearchSync: () => searchSyncRequired,
}));

const { updateAuthor } = await import("../author.service");

describe("updateAuthor", () => {
	beforeEach(() => {
		rename.mockClear();
		getIdByUuid.mockClear();
		getLinkedBookIds.mockClear();
		enqueueAuthorSync.mockClear();
		enqueueSearchSyncBulk.mockClear();
		searchSyncRequired = true;
		rename.mockImplementation(() => Promise.resolve("ok"));
		getIdByUuid.mockImplementation(() => Promise.resolve(23));
		getLinkedBookIds.mockImplementation(() => Promise.resolve([201, 202]));
	});

	test("syncs the entity and every linked item after an update", async () => {
		const result = await updateAuthor({
			uuid: "author-uuid",
			serverId: "server-1",
			name: "New name",
		});

		expect(result).toBe("ok");
		expect(enqueueAuthorSync).toHaveBeenCalledWith(23, {
			deduplicate: false,
		});
		expect(enqueueSearchSyncBulk).toHaveBeenCalledWith([201, 202], "update");
	});

	test("does not enqueue anything when the update is rejected", async () => {
		rename.mockImplementation(() => Promise.resolve("not_found"));

		expect(
			await updateAuthor({
				uuid: "author-uuid",
				serverId: "server-1",
				name: "Missing",
			}),
		).toBe("not_found");
		expect(getIdByUuid).not.toHaveBeenCalled();
		expect(enqueueAuthorSync).not.toHaveBeenCalled();
		expect(enqueueSearchSyncBulk).not.toHaveBeenCalled();
	});

	test("skips search lookups for a live-database provider", async () => {
		searchSyncRequired = false;

		expect(
			await updateAuthor({
				uuid: "author-uuid",
				serverId: "server-1",
				name: "New name",
			}),
		).toBe("ok");
		expect(getIdByUuid).not.toHaveBeenCalled();
		expect(getLinkedBookIds).not.toHaveBeenCalled();
		expect(enqueueAuthorSync).not.toHaveBeenCalled();
		expect(enqueueSearchSyncBulk).not.toHaveBeenCalled();
	});
});
