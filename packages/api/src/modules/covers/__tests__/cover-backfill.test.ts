import { beforeEach, describe, expect, mock, test } from "bun:test";

type Row = { bookId: number; cover: string };

const bulkAdds: {
	name: string;
	data: Record<string, unknown>;
	opts: Record<string, unknown>;
}[] = [];
const reserved: number[] = [];
let finalized = 0;
let cancelAfterPage: number | null = null;
let pagesServed = 0;

const ebookRows: Row[] = [];
const audiobookRows: Row[] = [];

function pager(rows: Row[]) {
	return async (afterBookId: number, limit: number): Promise<Row[]> => {
		pagesServed++;
		if (cancelAfterPage !== null && pagesServed > cancelAfterPage) {
			throw new Error("Task cancelled");
		}
		return rows.filter((r) => r.bookId > afterBookId).slice(0, limit);
	};
}

// mock.module is process-global in Bun, so every module mocked here re-exports
// the real one and overrides only what this suite observes. Replacing a module
// wholesale silently strips the rest of its exports for every other test file
// sharing this process.
mock.module("../../../infrastructure/queue/queues/cover-ingest.queue", () => ({
	coverIngestQueue: {
		add: mock(async () => ({ id: "1" })),
		addBulk: async (jobs: typeof bulkAdds) => {
			bulkAdds.push(...jobs);
			return jobs;
		},
	},
}));

const realTaskManager = await import("../../taskManager");
mock.module("../../taskManager", () => ({
	...realTaskManager,
	reserve: async (_taskId: string, count: number) => {
		reserved.push(count);
	},
	finalizeTask: async () => {
		finalized++;
	},
	throwIfTaskCancelled: async () => {},
}));

const realBookRepo = await import(
	"../../../routers/books/metadata/metadata.repository"
);
mock.module("../../../routers/books/metadata/metadata.repository", () => ({
	...realBookRepo,
	bookMetadataRepository: Object.assign(
		Object.create(
			Object.getPrototypeOf(realBookRepo.bookMetadataRepository) as object,
		),
		realBookRepo.bookMetadataRepository,
		{ listUningestedCovers: pager(ebookRows) },
	),
}));

const realAudiobookRepo = await import(
	"../../../routers/audiobooks/metadata/metadata.repository"
);
mock.module("../../../routers/audiobooks/metadata/metadata.repository", () => ({
	...realAudiobookRepo,
	audiobookMetadataRepository: Object.assign(
		Object.create(
			Object.getPrototypeOf(
				realAudiobookRepo.audiobookMetadataRepository,
			) as object,
		),
		realAudiobookRepo.audiobookMetadataRepository,
		{ listUningestedCovers: pager(audiobookRows) },
	),
}));

const { backfillCoverIngest } = await import("../cover-backfill");

beforeEach(() => {
	bulkAdds.length = 0;
	reserved.length = 0;
	ebookRows.length = 0;
	audiobookRows.length = 0;
	finalized = 0;
	pagesServed = 0;
	cancelAfterPage = null;
});

describe("backfillCoverIngest", () => {
	test("queues one ingest job per un-ingested cover, per media type", async () => {
		ebookRows.push({ bookId: 1, cover: "data/covers/a.jpg" });
		audiobookRows.push({ bookId: 7, cover: "data/covers/b.png" });

		const enqueued = await backfillCoverIngest("task-1");

		expect(enqueued).toBe(2);
		expect(bulkAdds).toHaveLength(2);
		expect(bulkAdds[0]?.data).toEqual({
			bookId: 1,
			coverPath: "data/covers/a.jpg",
			mediaType: "ebook",
			taskId: "task-1",
		});
		expect(bulkAdds[1]?.data).toMatchObject({ mediaType: "audiobook" });
	});

	test("carries the task so the ingest jobs count toward its progress", async () => {
		ebookRows.push({ bookId: 1, cover: "data/covers/a.jpg" });

		await backfillCoverIngest("task-1");

		expect(bulkAdds.every((j) => j.data.taskId === "task-1")).toBe(true);
	});

	test("reserves before enqueuing so the task never looks done mid-production", async () => {
		for (let i = 1; i <= 3; i++) {
			ebookRows.push({ bookId: i, cover: `data/covers/${i}.jpg` });
		}

		await backfillCoverIngest("task-1");

		expect(reserved).toEqual([3]);
	});

	test("keys each job to its cover so a re-run cannot double up", async () => {
		ebookRows.push({ bookId: 4, cover: "data/covers/d.jpg" });

		await backfillCoverIngest("task-1");
		await backfillCoverIngest("task-2");

		const ids = bulkAdds.map((j) => j.opts.jobId);
		expect(ids).toEqual(["backfill:ebook:4", "backfill:ebook:4"]);
	});

	test("pages with a keyset rather than one enormous result set", async () => {
		for (let i = 1; i <= 1200; i++) {
			ebookRows.push({ bookId: i, cover: `data/covers/${i}.jpg` });
		}

		const enqueued = await backfillCoverIngest("task-1");

		expect(enqueued).toBe(1200);
		expect(reserved).toEqual([500, 500, 200]);
	});

	test("seals the task even when the sweep is cancelled mid-flight", async () => {
		for (let i = 1; i <= 1200; i++) {
			ebookRows.push({ bookId: i, cover: `data/covers/${i}.jpg` });
		}
		cancelAfterPage = 1;

		await expect(backfillCoverIngest("task-1")).rejects.toThrow(
			"Task cancelled",
		);

		// The jobs already queued still have to be counted, or the task hangs.
		expect(finalized).toBe(1);
		expect(bulkAdds).toHaveLength(500);
	});

	test("runs untracked when there is no task", async () => {
		ebookRows.push({ bookId: 1, cover: "data/covers/a.jpg" });

		await backfillCoverIngest();

		expect(reserved).toEqual([]);
		expect(finalized).toBe(0);
		expect(bulkAdds[0]?.data.taskId).toBeUndefined();
	});
});
