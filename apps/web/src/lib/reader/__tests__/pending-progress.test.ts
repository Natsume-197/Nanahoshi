import "@/test-utils/setup-dom";
import { beforeEach, describe, expect, it, mock } from "bun:test";

// Control the orpc client's saveProgress without loading the real client (whose
// env validation needs VITE_SERVER_URL). Mock BEFORE importing the module.
let deferred: {
	promise: Promise<void>;
	resolve: () => void;
	reject: () => void;
};
function newDeferred() {
	let resolve!: () => void;
	let reject!: () => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = () => rej(new Error("network"));
	});
	return { promise, resolve, reject };
}

const saveProgress = mock(() => deferred.promise);

mock.module("@/utils/orpc", () => ({
	client: { readingProgress: { saveProgress } },
}));

const { markPendingProgress, clearPendingProgress, flushPendingProgress } =
	await import("../pending-progress");

const KEY = "nanahoshi-pending-progress";

beforeEach(() => {
	localStorage.clear();
	saveProgress.mockClear();
	deferred = newDeferred();
});

describe("markPendingProgress", () => {
	it("writes an entry to the queue", () => {
		markPendingProgress({
			bookUuid: "a",
			bookCharCount: 1000,
			readingTimeSeconds: 30,
			status: "reading",
		});
		const queue = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		expect(queue.a.readingTimeSeconds).toBe(30);
		expect(queue.a.status).toBe("reading");
	});

	it("sums reading time and overwrites position/status on a second call", () => {
		markPendingProgress({
			bookUuid: "a",
			bookCharCount: 1000,
			exploredCharCount: 100,
			readingTimeSeconds: 30,
			status: "reading",
		});
		markPendingProgress({
			bookUuid: "a",
			bookCharCount: 1000,
			exploredCharCount: 250,
			readingTimeSeconds: 45,
			status: "completed",
		});
		const queue = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		expect(queue.a.readingTimeSeconds).toBe(75); // summed
		expect(queue.a.exploredCharCount).toBe(250); // latest
		expect(queue.a.status).toBe("completed"); // latest
	});
});

describe("clearPendingProgress", () => {
	it("removes one entry and drops the localStorage key when empty", () => {
		markPendingProgress({
			bookUuid: "a",
			bookCharCount: 1,
			readingTimeSeconds: 1,
			status: "reading",
		});
		clearPendingProgress("a");
		expect(localStorage.getItem(KEY)).toBeNull();
	});
});

describe("flushPendingProgress", () => {
	it("delivers each entry and clears delivered ones", async () => {
		markPendingProgress({
			bookUuid: "a",
			bookCharCount: 1,
			readingTimeSeconds: 10,
			status: "reading",
		});
		deferred.resolve();
		await flushPendingProgress();
		expect(saveProgress).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem(KEY)).toBeNull(); // cleared
	});

	it("keeps an entry queued when its sync rejects", async () => {
		markPendingProgress({
			bookUuid: "a",
			bookCharCount: 1,
			readingTimeSeconds: 10,
			status: "reading",
		});
		deferred.reject();
		await flushPendingProgress();
		const queue = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		expect(queue.a).toBeDefined(); // still queued for the next flush
	});

	it("is re-entrant-guarded: a second flush while one is in flight is a no-op", async () => {
		markPendingProgress({
			bookUuid: "a",
			bookCharCount: 1,
			readingTimeSeconds: 10,
			status: "reading",
		});
		const first = flushPendingProgress(); // sets flushing=true, awaits saveProgress
		const second = flushPendingProgress(); // sees flushing=true -> returns early
		deferred.resolve();
		await Promise.all([first, second]);
		expect(saveProgress).toHaveBeenCalledTimes(1);
	});
});
