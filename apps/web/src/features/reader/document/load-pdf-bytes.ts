import { readBlobWithProgress } from "@/features/reader/document/processing/fetch-with-progress";
import { client } from "@/utils/orpc";
import {
	canCacheReaderBook,
	getCachedReaderBookFile,
	getReaderBookCacheGeneration,
	putCachedReaderBookFile,
} from "./reader-book-cache";

/**
 * The PDF viewer needs the whole file before its first page, so it is fetched
 * once, shared with every render worker, and kept in the reader cache so a
 * reopen skips the network.
 */
export async function loadPdfBytes({
	uuid,
	serverId,
	fileHash,
	fileSizeBytes,
	signal,
	onDownloadProgress,
}: {
	uuid: string;
	serverId: string;
	fileHash?: string | null;
	fileSizeBytes?: number;
	signal?: AbortSignal;
	onDownloadProgress: (progress: number | undefined) => void;
}): Promise<ArrayBuffer> {
	const cacheGeneration = getReaderBookCacheGeneration();
	const cacheCandidate = { serverId, uuid, fileHash };
	const cacheKey = canCacheReaderBook(cacheCandidate)
		? cacheCandidate
		: undefined;
	const cached = cacheKey ? await getCachedReaderBookFile(cacheKey) : undefined;
	signal?.throwIfAborted();
	if (cached) return cached.arrayBuffer();

	onDownloadProgress(0);
	const { url } = await client.files.getReaderUrl(
		{ uuid, serverId },
		{ signal },
	);
	const response = await fetch(url, { credentials: "include", signal });
	if (!response.ok) {
		throw new Error(`Download failed with status ${response.status}`);
	}
	const blob = await readBlobWithProgress(
		response,
		onDownloadProgress,
		fileSizeBytes,
	);
	signal?.throwIfAborted();
	if (cacheKey) void putCachedReaderBookFile(cacheKey, blob, cacheGeneration);
	return blob.arrayBuffer();
}
