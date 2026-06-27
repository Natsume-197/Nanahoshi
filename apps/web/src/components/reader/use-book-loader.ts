import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CACHED_BOOKS_QUERY_KEY } from "@/hooks/use-cached-books";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { fetchAndCacheEpub } from "@/lib/reader/download-book";
import { formatBookDataHtml } from "@/lib/reader/format-book-data-html";
import { loadLocalBookmark } from "@/lib/reader/local-bookmark";
import { resolveInitialBookmark } from "@/lib/reader/resolve-bookmark";
import { loadReaderSettings } from "@/lib/reader/settings";
import type { ReaderBookData, ReaderBookmark } from "@/lib/reader/types";
import { readerColumnHeight } from "@/lib/reader/viewport";
import { client } from "@/utils/orpc";

export type LoadState =
	| { phase: "loading" | "parsing" }
	/** `progress` is 0–1, or undefined while the download size is unknown. */
	| { phase: "downloading"; progress: number | undefined }
	| { phase: "error"; message: string }
	| {
			phase: "ready";
			data: ReaderBookData;
			html: string;
			bookmark: ReaderBookmark | undefined;
	  };

interface UseBookLoaderArgs {
	uuid: string;
	bookTitle: string;
	cover?: string | null;
	/** Server the book belongs to, recorded on the offline copy so the downloads
	 *  list stays scoped to the active server. */
	serverId: string | null;
	/** File size in bytes from the book metadata, used as the download progress
	 *  total when the response omits Content-Length (chunked transfer). */
	fileSizeBytes?: number;
	/** Called once the book is parsed and the restore position is resolved,
	 *  before the reader renders. */
	onLoaded: (result: {
		data: ReaderBookData;
		bookmark: ReaderBookmark | undefined;
	}) => void;
}

/**
 * Loads a book for the reader: reads the IndexedDB cache, otherwise downloads
 * and parses the EPUB and caches it, formats the HTML, and resolves the reading
 * position from the local bookmark + server progress (fetched in parallel).
 */
export function useBookLoader({
	uuid,
	bookTitle,
	cover,
	serverId,
	fileSizeBytes,
	onLoaded,
}: UseBookLoaderArgs): LoadState {
	const [loadState, setLoadState] = useState<LoadState>({ phase: "loading" });
	const queryClient = useQueryClient();
	const onLoadedRef = useRef(onLoaded);
	onLoadedRef.current = onLoaded;

	useMountEffect(() => {
		let cancelled = false;
		const objectUrls: string[] = [];

		(async () => {
			try {
				// Server progress is fetched in parallel with the (potentially
				// heavy) cache read / download+parse.
				const serverProgressPromise = client.readingProgress
					.getProgress({ bookUuid: uuid })
					.then((progress) => ({
						exploredCharCount: progress?.exploredCharCount ?? 0,
						modifiedAt: progress?.lastReadAt
							? new Date(progress.lastReadAt).getTime()
							: 0,
					}))
					.catch(() => ({ exploredCharCount: 0, modifiedAt: 0 }));

				const data = await fetchAndCacheEpub(
					uuid,
					bookTitle,
					fileSizeBytes,
					serverId,
					{
						cover,
						onDownloadProgress: (progress) => {
							if (!cancelled) setLoadState({ phase: "downloading", progress });
						},
						onParsing: () => {
							if (!cancelled) setLoadState({ phase: "parsing" });
						},
					},
				);
				queryClient.invalidateQueries({ queryKey: CACHED_BOOKS_QUERY_KEY });
				if (cancelled || !data) return;

				const serverProgress = await serverProgressPromise;
				const initial = resolveInitialBookmark(
					loadLocalBookmark(uuid),
					serverProgress,
				);

				const currentSettings = loadReaderSettings();
				// Mirrors the max-height caps in reader.css (100vh, and
				// --book-content-child-height in vertical mode).
				const imageFitHeight = readerColumnHeight(
					currentSettings.writingMode === "vertical-rl",
					currentSettings.secondDimensionMaxValue,
				);
				const formatted = await formatBookDataHtml(
					data,
					document,
					currentSettings.blurMode === "after-toc",
					imageFitHeight,
				);
				objectUrls.push(...formatted.objectUrls);
				if (cancelled) {
					for (const url of objectUrls) {
						URL.revokeObjectURL(url);
					}
					return;
				}

				onLoadedRef.current({ data, bookmark: initial });
				setLoadState({
					phase: "ready",
					data,
					html: formatted.elementHtml,
					bookmark: initial,
				});
			} catch (error) {
				if (!cancelled) {
					setLoadState({
						phase: "error",
						message:
							error instanceof Error ? error.message : "Failed to load book",
					});
				}
			}
		})();

		return () => {
			cancelled = true;
			for (const url of objectUrls) {
				URL.revokeObjectURL(url);
			}
		};
	});

	return loadState;
}
