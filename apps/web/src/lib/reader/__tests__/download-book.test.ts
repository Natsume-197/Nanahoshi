import "@/test-utils/setup-dom";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReaderBookData } from "../types";

// Hoisted state the module mocks read, so each test can script one load.
const state = {
	cached: undefined as ReaderBookData | undefined,
	downloads: 0,
	signedUrls: 0,
	cacheWrites: 0,
	resolveDownload: undefined as ((blob: Blob) => void) | undefined,
	onProgress: undefined as ((progress: number | undefined) => void) | undefined,
};

function book(uuid: string): ReaderBookData {
	return {
		uuid,
		title: "t",
		language: "ja",
		elementHtml: "<p>x</p>",
		styleSheet: "",
		blobs: {},
		characters: 1,
		sections: [],
		storedAt: 0,
		countVersion: 2,
	};
}

mock.module("@/lib/reader/db", () => ({
	getCachedBook: async () => state.cached,
	cacheBook: async () => {
		state.cacheWrites += 1;
	},
}));

mock.module("@/lib/reader/epub/load-epub", () => ({
	loadEpub: async (uuid: string) => book(uuid),
}));

mock.module("@/lib/reader/fetch-with-progress", () => ({
	readBlobWithProgress: async (
		_response: Response,
		onProgress: (progress: number | undefined) => void,
	) => {
		state.onProgress = onProgress;
		return new Promise<Blob>((resolve) => {
			state.resolveDownload = resolve;
		});
	},
}));

mock.module("@/utils/orpc", () => ({
	client: {
		files: {
			getSignedDownloadUrl: async () => {
				state.signedUrls += 1;
				return { url: "http://x/download/1" };
			},
		},
	},
}));

mock.module("@/lib/reader/settings", () => ({
	loadReaderSettings: () => ({ maxCachedBooks: 10 }),
}));

const globalFetch = globalThis.fetch;
const okFetch = (async () => {
	state.downloads += 1;
	return { ok: true } as Response;
}) as unknown as typeof fetch;

const { fetchAndCacheEpub, isBookLoadPending } = await import(
	"../download-book"
);

beforeEach(() => {
	// Re-armed per test: one case swaps in a failing fetch.
	globalThis.fetch = okFetch;
	state.cached = undefined;
	state.downloads = 0;
	state.signedUrls = 0;
	state.cacheWrites = 0;
	state.resolveDownload = undefined;
	state.onProgress = undefined;
});

afterAll(() => {
	globalThis.fetch = globalFetch;
});

/** The load reaches the download only after several async hops (cache read,
 *  signed URL, fetch); wait for it rather than guessing a tick count. */
async function untilDownloading() {
	for (let i = 0; i < 200 && !state.resolveDownload; i += 1) {
		await new Promise((r) => setTimeout(r, 1));
	}
	if (!state.resolveDownload) throw new Error("download never started");
}

async function finishDownload() {
	await untilDownloading();
	state.resolveDownload?.(new Blob(["z"]));
}

describe("fetchAndCacheEpub in-flight sharing", () => {
	it("downloads once when a prefetch and the reader race for one book", async () => {
		const prefetch = fetchAndCacheEpub("a", "t", undefined, null);
		const reader = fetchAndCacheEpub("a", "t", undefined, null);

		expect(isBookLoadPending("a")).toBe(true);
		await finishDownload();
		const [p, r] = await Promise.all([prefetch, reader]);

		expect(state.downloads).toBe(1);
		expect(state.signedUrls).toBe(1);
		expect(p.data).toBe(r.data);
	});

	it("forwards progress to a caller that joins mid-download", async () => {
		const seen: (number | undefined)[] = [];
		const started = fetchAndCacheEpub("b", "t", undefined, null);
		await untilDownloading();
		state.onProgress?.(0.5);

		const joined = fetchAndCacheEpub("b", "t", undefined, null, {
			onDownloadProgress: (p) => seen.push(p),
		});
		// Replayed immediately, then live for subsequent ticks.
		expect(seen).toEqual([0.5]);
		state.onProgress?.(0.75);
		expect(seen).toEqual([0.5, 0.75]);

		state.resolveDownload?.(new Blob(["z"]));
		await Promise.all([started, joined]);
	});

	it("stops sharing once the load settles", async () => {
		const first = fetchAndCacheEpub("c", "t", undefined, null);
		await finishDownload();
		await first;

		expect(isBookLoadPending("c")).toBe(false);

		state.cached = book("c");
		const second = await fetchAndCacheEpub("c", "t", undefined, null);
		// Served from cache, no second download.
		expect(state.downloads).toBe(1);
		expect(second.data.uuid).toBe("c");
	});

	it("does not leave a failed load pinned as in-flight", async () => {
		globalThis.fetch = (async () => ({
			ok: false,
			status: 500,
		})) as unknown as typeof fetch;

		await expect(fetchAndCacheEpub("d", "t", undefined, null)).rejects.toThrow(
			/500/,
		);
		expect(isBookLoadPending("d")).toBe(false);
	});

	it("resolves the book before the cache write completes", async () => {
		const load = fetchAndCacheEpub("e", "t", undefined, null);
		await finishDownload();
		const { data, written } = await load;

		expect(data.uuid).toBe("e");
		await written;
		expect(state.cacheWrites).toBe(1);
	});

	it("takes the cover from whichever caller supplied one", async () => {
		const plain = fetchAndCacheEpub("f", "t", undefined, null, { cover: null });
		const withCover = fetchAndCacheEpub("f", "t", undefined, null, {
			cover: "/covers/f.jpg",
		});

		await finishDownload();
		const { data } = await withCover;
		await plain;
		expect(data.cover).toBe("/covers/f.jpg");
	});
});
