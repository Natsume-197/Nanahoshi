import { ebookSourceFormatForFilename } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import { openEbook, openEpubSource } from "@nanahoshi-v2/ebook-parser";
import { readBlobWithProgress } from "@/features/reader/document/processing/fetch-with-progress";
import type { ReaderSourceFormat } from "@/features/reader/document/types";
import {
	createReaderBookSession,
	type ReaderBookSession,
} from "@/features/reader/session/reader-book-session";
import { client } from "@/utils/orpc";
import { openHttpRangeZipSource } from "./http-range-zip-source";
import { openLazyHtmlBook } from "./lazy-html-book";
import { loadEbook } from "./load-ebook";
import {
	canCacheReaderBook,
	getCachedReaderBookFile,
	getReaderBookCacheGeneration,
	getReaderBookFacts,
	putCachedReaderBookFile,
	putReaderBookFacts,
	readerBookFactsFromData,
} from "./reader-book-cache";
import {
	getReaderBookMemoryCache,
	putReaderBookMemoryCache,
} from "./reader-book-memory-cache";

export interface LoadBookCallbacks {
	/** 0–1, or undefined while the size is unknown. */
	onDownloadProgress?: (progress: number | undefined) => void;
	onParsing?: () => void;
}

export type LoadedReaderBook = ReaderBookSession;

/** Downloads and parses one ebook for the active reading session. */
export async function loadBookForReader({
	uuid,
	bookTitle,
	cover,
	fileSizeBytes,
	fileHash,
	fileName,
	serverId,
	sourceFormat,
	allowLazySections = false,
	callbacks = {},
	signal,
}: {
	uuid: string;
	bookTitle: string;
	cover?: string | null;
	fileSizeBytes?: number;
	fileHash?: string | null;
	fileName?: string;
	serverId: string | null;
	sourceFormat?: ReaderSourceFormat;
	/** Only paginated text can consume section HTML independently. */
	allowLazySections?: boolean;
	callbacks?: LoadBookCallbacks;
	/** Owned by this opening; shared cache reads and writes are never aborted. */
	signal?: AbortSignal;
}): Promise<LoadedReaderBook> {
	signal?.throwIfAborted();
	if (!serverId) throw new Error("Reading requires a server connection");

	const cacheGeneration = getReaderBookCacheGeneration();
	const cacheCandidate = { serverId, uuid, fileHash };
	const cacheKey = canCacheReaderBook(cacheCandidate)
		? cacheCandidate
		: undefined;
	let filename = fileName;
	const cached =
		cacheKey && !allowLazySections
			? getReaderBookMemoryCache(cacheKey)
			: undefined;
	// A known filename lets an in-memory hit avoid storage and network entirely.
	if (filename) {
		const format = ebookSourceFormatForFilename(filename);
		if (!format || (sourceFormat && format !== sourceFormat)) {
			throw new Error(`Unsupported ebook format: ${filename}`);
		}
		if (cached) {
			cached.cover = cover ?? null;
			return createReaderBookSession({ data: cached });
		}
	}
	let [blob, facts] = cacheKey
		? await Promise.all([
				getCachedReaderBookFile(cacheKey),
				getReaderBookFacts(cacheKey),
			])
		: [undefined, undefined];
	signal?.throwIfAborted();
	let readerUrl: string | undefined;

	if (!filename || (!blob && facts)) {
		const readerFile = await client.files.getReaderUrl(
			{ uuid, serverId },
			{ signal },
		);
		filename ??= readerFile.filename;
		readerUrl = readerFile.url;
	}
	signal?.throwIfAborted();
	const resolvedFormat = filename
		? ebookSourceFormatForFilename(filename)
		: undefined;
	if (!resolvedFormat || (sourceFormat && resolvedFormat !== sourceFormat)) {
		throw new Error(`Unsupported ebook format: ${filename ?? "unknown"}`);
	}
	if (cached && cacheGeneration === getReaderBookCacheGeneration()) {
		cached.cover = cover ?? null;
		return createReaderBookSession({ data: cached });
	}

	// Facts make the outline and absolute character coordinates available without
	// walking every chapter again. If bytes are not cached, the same session is
	// backed by HTTP Range instead of a whole-file download.
	if (
		allowLazySections &&
		facts &&
		(resolvedFormat === "epub" || resolvedFormat === "kepub")
	) {
		let ebook: Awaited<ReturnType<typeof openEbook>> | undefined;
		try {
			callbacks.onParsing?.();
			ebook = blob
				? await openEbook(blob, { filename })
				: await openEpubSource(
						await openHttpRangeZipSource(
							readerUrl ??
								(
									await client.files.getReaderUrl(
										{ uuid, serverId },
										{ signal },
									)
								).url,
							signal,
						),
						resolvedFormat,
					);
			signal?.throwIfAborted();
			const lazyBook = await openLazyHtmlBook({
				ebook,
				uuid,
				fallbackTitle: bookTitle,
				document,
				facts,
			});
			signal?.throwIfAborted();
			lazyBook.data.cover = cover ?? null;
			return createReaderBookSession({ data: lazyBook.data, lazyBook });
		} catch {
			// Ownership transfers to the session only after lazy setup succeeds.
			// Cleanup errors must not turn cancellation into a full download.
			await ebook?.close().catch(() => {});
			signal?.throwIfAborted();
			// An old cache or a Range-stripping proxy must never make the book
			// unreadable. The established complete-download path remains the
			// conservative fallback and refreshes the facts below.
		}
	}

	if (!blob) {
		callbacks.onDownloadProgress?.(0);
		if (!readerUrl) {
			const readerFile = await client.files.getReaderUrl(
				{ uuid, serverId },
				{ signal },
			);
			filename ??= readerFile.filename;
			readerUrl = readerFile.url;
		}
		const response = await fetch(readerUrl, { credentials: "include", signal });
		if (!response.ok) {
			throw new Error(`Download failed with status ${response.status}`);
		}
		blob = await readBlobWithProgress(
			response,
			(progress) => callbacks.onDownloadProgress?.(progress),
			fileSizeBytes,
		);
		signal?.throwIfAborted();
		if (cacheKey) void putCachedReaderBookFile(cacheKey, blob, cacheGeneration);
	}

	signal?.throwIfAborted();
	callbacks.onParsing?.();
	const data = await loadEbook(
		uuid,
		blob,
		filename ?? "",
		bookTitle,
		document,
		facts,
		signal,
	);
	signal?.throwIfAborted();
	data.cover = cover ?? null;
	if (cacheKey && cacheGeneration === getReaderBookCacheGeneration()) {
		// Applying valid facts preserves this array, so there is nothing to rewrite.
		if (data.sectionCharacterCounts !== facts?.sectionCharacterCounts) {
			const freshFacts = readerBookFactsFromData(data);
			if (freshFacts)
				void putReaderBookFacts(cacheKey, freshFacts, cacheGeneration);
		}
		if (!allowLazySections) putReaderBookMemoryCache(cacheKey, data);
	}
	return createReaderBookSession({ data });
}
