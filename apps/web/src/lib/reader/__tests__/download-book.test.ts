import "@/test-utils/setup-dom";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { resolveReaderPresentation } from "../reader-presentation";
import {
	BOOK_CONTENT_FORM_VERSION,
	BOOK_RESOURCE_VERSION,
	type ReaderBookData,
} from "../types";

// Hoisted state the module mocks read, so each test can script one load.
const state = {
	cached: undefined as ReaderBookData | undefined,
	downloads: 0,
	signedUrls: 0,
	signedUrlInput: undefined as { uuid: string } | undefined,
	filename: "book.epub",
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
		contentForm: "text",
		contentFormVersion: BOOK_CONTENT_FORM_VERSION,
		resourceVersion: BOOK_RESOURCE_VERSION,
	};
}

mock.module("@/lib/reader/db", () => ({
	getCachedBook: async () => state.cached,
	cacheBook: async () => {
		state.cacheWrites += 1;
	},
}));

mock.module("@/lib/reader/load-ebook", () => ({
	loadEbook: async (
		uuid: string,
		_blob: Blob,
		filename: string,
		_title: string,
		_document: Document,
	) => ({
		...book(uuid),
		sourceFormat: filename.endsWith(".mobi")
			? "mobi"
			: filename.endsWith(".azw3")
				? "azw3"
				: "epub",
	}),
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
			getSignedDownloadUrl: async (input: { uuid: string }) => {
				state.signedUrls += 1;
				state.signedUrlInput = input;
				return { url: "http://x/download/1", filename: state.filename };
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

const { fetchAndCacheBook, isBookLoadPending } = await import(
	"../download-book"
);

beforeEach(() => {
	// Re-armed per test: one case swaps in a failing fetch.
	globalThis.fetch = okFetch;
	state.cached = undefined;
	state.downloads = 0;
	state.signedUrls = 0;
	state.signedUrlInput = undefined;
	state.filename = "book.epub";
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

describe("fetchAndCacheBook in-flight sharing", () => {
	it("downloads once when a prefetch and the reader race for one book", async () => {
		const prefetch = fetchAndCacheBook("a", "t", undefined, null);
		const reader = fetchAndCacheBook("a", "t", undefined, null);

		expect(isBookLoadPending("a")).toBe(true);
		await finishDownload();
		const [p, r] = await Promise.all([prefetch, reader]);

		expect(state.downloads).toBe(1);
		expect(state.signedUrls).toBe(1);
		expect(state.signedUrlInput).toEqual({ uuid: "a" });
		expect(p.data).toBe(r.data);
	});

	it("forwards progress to a caller that joins mid-download", async () => {
		const seen: (number | undefined)[] = [];
		const started = fetchAndCacheBook("b", "t", undefined, null);
		await untilDownloading();
		state.onProgress?.(0.5);

		const joined = fetchAndCacheBook("b", "t", undefined, null, {
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
		const first = fetchAndCacheBook("c", "t", undefined, null);
		await finishDownload();
		await first;

		expect(isBookLoadPending("c")).toBe(false);

		state.cached = book("c");
		const second = await fetchAndCacheBook("c", "t", undefined, null);
		// Served from cache, no second download.
		expect(state.downloads).toBe(1);
		expect(second.data.uuid).toBe("c");
	});

	it("does not leave a failed load pinned as in-flight", async () => {
		globalThis.fetch = (async () => ({
			ok: false,
			status: 500,
		})) as unknown as typeof fetch;

		await expect(fetchAndCacheBook("d", "t", undefined, null)).rejects.toThrow(
			/500/,
		);
		expect(isBookLoadPending("d")).toBe(false);
	});

	it("resolves the book before the cache write completes", async () => {
		const load = fetchAndCacheBook("e", "t", undefined, null);
		await finishDownload();
		const { data, written } = await load;

		expect(data.uuid).toBe("e");
		await written;
		expect(state.cacheWrites).toBe(1);
	});

	it("takes the cover from whichever caller supplied one", async () => {
		const plain = fetchAndCacheBook("f", "t", undefined, null, { cover: null });
		const withCover = fetchAndCacheBook("f", "t", undefined, null, {
			cover: "/covers/f.jpg",
		});

		await finishDownload();
		const { data } = await withCover;
		await plain;
		expect(data.cover).toBe("/covers/f.jpg");
	});

	it("replaces a cached book produced from a different source format", async () => {
		state.cached = { ...book("format-change"), sourceFormat: "azw3" };
		const load = fetchAndCacheBook("format-change", "t", undefined, null, {
			sourceFormat: "epub",
		});
		await finishDownload();
		const { data } = await load;

		expect(state.downloads).toBe(1);
		expect(data.uuid).toBe("format-change");
	});

	it("reclassifies a legacy cached image EPUB before resolving its presentation", async () => {
		state.cached = {
			...book("legacy-image-epub"),
			sourceFormat: "epub",
			presentation: {
				layout: "pre-paginated",
				spread: "landscape",
				declaresPageResolution: true,
			},
			contentForm: undefined,
			contentFormVersion: undefined,
			elementHtml: Array.from(
				{ length: 3 },
				(_, index) =>
					`<div id="page-${index}"><img src="page-${index}.jpg"></div>`,
			).join(""),
			sections: Array.from({ length: 3 }, (_, index) => ({
				reference: `page-${index}`,
				charactersWeight: 1,
			})),
		};

		const { data, written } = await fetchAndCacheBook(
			"legacy-image-epub",
			"t",
			undefined,
			null,
			{ sourceFormat: "epub" },
		);

		expect(
			resolveReaderPresentation({
				book: data,
				preference: { readAs: "auto" },
				defaultTextLayout: "scroll",
				comicLayout: "single-page",
			}).supportsComic,
		).toBe(true);
		expect(state.downloads).toBe(0);
		await written;
		expect(state.cacheWrites).toBe(1);
	});

	it("routes MOBI downloads through the ebook loader", async () => {
		state.filename = "book.mobi";
		const load = fetchAndCacheBook("mobi-book", "t", undefined, null, {
			sourceFormat: "mobi",
		});
		await finishDownload();
		const { data } = await load;

		expect(data.sourceFormat).toBe("mobi");
	});
});
