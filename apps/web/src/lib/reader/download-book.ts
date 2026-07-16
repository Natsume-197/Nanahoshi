import { cacheBook, getCachedBook } from "@/lib/reader/db";
import { loadEpub } from "@/lib/reader/epub/load-epub";
import { readBlobWithProgress } from "@/lib/reader/fetch-with-progress";
import { recountBookData } from "@/lib/reader/recount-book-data";
import { loadReaderSettings } from "@/lib/reader/settings";
import { BOOK_COUNT_VERSION, type ReaderBookData } from "@/lib/reader/types";
import { client } from "@/utils/orpc";

export interface FetchAndCacheCallbacks {
	/** 0–1, or undefined while the size is unknown. */
	onDownloadProgress?: (progress: number | undefined) => void;
	onParsing?: () => void;
	/** Cover path from book metadata, shown on the downloads page. */
	cover?: string | null;
}

export interface FetchedBook {
	data: ReaderBookData;
	/**
	 * The IndexedDB write, which runs in the background: the reader has
	 * everything it needs in `data`, and a multi-MB put on the open path just
	 * delays first paint (a lost write only costs a re-download next open).
	 * Await this only to report the offline copy as saved. Never rejects.
	 */
	written: Promise<void>;
}

interface InFlightLoad {
	promise: Promise<FetchedBook>;
	/** Every caller waiting on this load; all of them get progress events, so a
	 *  reader that joins a prefetch mid-download still shows a real progress
	 *  bar instead of a bare spinner. */
	subscribers: Set<FetchAndCacheCallbacks>;
	/** Replayed to late subscribers so they don't wait for the next tick. */
	lastPhase?:
		| { kind: "downloading"; progress: number | undefined }
		| { kind: "parsing" };
}

/**
 * In-flight loads by uuid, so a prefetch already downloading a book and the
 * reader opening that same book share one download+parse instead of racing two.
 * Entries are dropped as soon as they settle — the IndexedDB cache takes over.
 */
const inFlight = new Map<string, InFlightLoad>();

/**
 * Returns the cached book, or downloads, parses and caches the EPUB. Concurrent
 * calls for the same uuid share a single load and all receive its progress.
 */
export function fetchAndCacheEpub(
	uuid: string,
	bookTitle: string,
	fileSizeBytes: number | undefined,
	serverId: string | null,
	callbacks: FetchAndCacheCallbacks = {},
): Promise<FetchedBook> {
	const existing = inFlight.get(uuid);
	if (existing) {
		existing.subscribers.add(callbacks);
		// Catch the joiner up to wherever the shared load already is.
		if (existing.lastPhase?.kind === "downloading") {
			callbacks.onDownloadProgress?.(existing.lastPhase.progress);
		} else if (existing.lastPhase?.kind === "parsing") {
			callbacks.onParsing?.();
		}
		return existing.promise;
	}

	const subscribers = new Set([callbacks]);
	const entry: InFlightLoad = {
		promise: undefined as unknown as Promise<FetchedBook>,
		subscribers,
	};

	entry.promise = loadBook(uuid, bookTitle, fileSizeBytes, serverId, {
		// Metadata is read at the point of use, so a caller that joins mid-load
		// can still supply the cover an earlier prefetch didn't have.
		getCover: () => [...subscribers].map((c) => c.cover).find(Boolean) ?? null,
		onDownloadProgress: (progress) => {
			entry.lastPhase = { kind: "downloading", progress };
			for (const c of subscribers) c.onDownloadProgress?.(progress);
		},
		onParsing: () => {
			entry.lastPhase = { kind: "parsing" };
			for (const c of subscribers) c.onParsing?.();
		},
	});
	inFlight.set(uuid, entry);

	return entry.promise.finally(() => {
		if (inFlight.get(uuid) === entry) inFlight.delete(uuid);
	});
}

/** True while `uuid` is already being fetched — a prefetch would be redundant. */
export function isBookLoadPending(uuid: string): boolean {
	return inFlight.has(uuid);
}

interface LoadHooks {
	getCover: () => string | null;
	onDownloadProgress: (progress: number | undefined) => void;
	onParsing: () => void;
}

async function loadBook(
	uuid: string,
	bookTitle: string,
	fileSizeBytes: number | undefined,
	serverId: string | null,
	{ getCover, onDownloadProgress, onParsing }: LoadHooks,
): Promise<FetchedBook> {
	// cacheBook resolves on timeout/failure rather than rejecting, so `written`
	// never needs a rejection handler on the open path.
	const persist = (book: ReaderBookData) =>
		cacheBook(book, loadReaderSettings().maxCachedBooks);

	const cached = await getCachedBook(uuid);
	if (cached) {
		if (cached.countVersion === BOOK_COUNT_VERSION) {
			return { data: cached, written: Promise.resolve() };
		}
		const recounted = recountBookData(cached, document);
		// Best-effort persist; the recount is cheap enough to redo next open.
		return { data: recounted, written: persist(recounted) };
	}

	onDownloadProgress(0);
	const { url } = await client.files.getSignedDownloadUrl({ uuid });
	const response = await fetch(url, { credentials: "include" });
	if (!response.ok) {
		throw new Error(`Download failed with status ${response.status}`);
	}
	const blob = await readBlobWithProgress(
		response,
		onDownloadProgress,
		fileSizeBytes,
	);

	onParsing();
	const data = await loadEpub(uuid, blob, bookTitle, document);
	data.cover = getCover();
	data.serverId = serverId;
	return { data, written: persist(data) };
}
