import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { cacheBook, getCachedBook } from "@/lib/reader/db";
import { loadEpub } from "@/lib/reader/epub/load-epub";
import { formatBookDataHtml } from "@/lib/reader/format-book-data-html";
import { loadLocalBookmark } from "@/lib/reader/local-bookmark";
import { resolveInitialBookmark } from "@/lib/reader/resolve-bookmark";
import { loadReaderSettings } from "@/lib/reader/settings";
import type { ReaderBookData, ReaderBookmark } from "@/lib/reader/types";
import { client } from "@/utils/orpc";

export type LoadState =
	| { phase: "loading" | "downloading" | "parsing" }
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
	onLoaded,
}: UseBookLoaderArgs): LoadState {
	const [loadState, setLoadState] = useState<LoadState>({ phase: "loading" });
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

				let data = await getCachedBook(uuid);

				if (!data) {
					setLoadState({ phase: "downloading" });
					const { url } = await client.files.getSignedDownloadUrl({ uuid });
					const response = await fetch(url, { credentials: "include" });
					if (!response.ok) {
						throw new Error(`Download failed with status ${response.status}`);
					}
					const blob = await response.blob();
					if (cancelled) return;

					setLoadState({ phase: "parsing" });
					data = await loadEpub(uuid, blob, bookTitle, document);
					await cacheBook(data);
				}
				if (cancelled || !data) return;

				const serverProgress = await serverProgressPromise;
				const initial = resolveInitialBookmark(
					loadLocalBookmark(uuid),
					serverProgress,
				);

				const currentSettings = loadReaderSettings();
				// Mirrors the max-height caps in reader.css (100vh, and
				// --book-content-child-height in vertical mode).
				const imageFitHeight = Math.min(
					window.innerHeight,
					(currentSettings.writingMode === "vertical-rl" &&
						currentSettings.secondDimensionMaxValue) ||
						window.innerHeight,
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
