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

/** Returns the cached book, or downloads, parses and caches the EPUB. */
export async function fetchAndCacheEpub(
	uuid: string,
	bookTitle: string,
	fileSizeBytes: number | undefined,
	serverId: string | null,
	{ onDownloadProgress, onParsing, cover }: FetchAndCacheCallbacks = {},
): Promise<ReaderBookData> {
	const cached = await getCachedBook(uuid);
	if (cached) {
		if (cached.countVersion === BOOK_COUNT_VERSION) return cached;
		const recounted = recountBookData(cached, document);
		// Best-effort persist; the recount is cheap enough to redo next open.
		await cacheBook(recounted, loadReaderSettings().maxCachedBooks);
		return recounted;
	}

	onDownloadProgress?.(0);
	const { url } = await client.files.getSignedDownloadUrl({ uuid });
	const response = await fetch(url, { credentials: "include" });
	if (!response.ok) {
		throw new Error(`Download failed with status ${response.status}`);
	}
	const blob = await readBlobWithProgress(
		response,
		(progress) => onDownloadProgress?.(progress),
		fileSizeBytes,
	);

	onParsing?.();
	const data = await loadEpub(uuid, blob, bookTitle, document);
	data.cover = cover ?? null;
	data.serverId = serverId;
	await cacheBook(data, loadReaderSettings().maxCachedBooks);
	return data;
}
