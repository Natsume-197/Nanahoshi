import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CACHED_BOOKS_QUERY_KEY } from "@/hooks/use-cached-books";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { fetchAndCacheBook } from "@/lib/reader/download-book";
import { formatBookDataHtml } from "@/lib/reader/format-book-data-html";
import { loadLocalBookmark } from "@/lib/reader/local-bookmark";
import {
	createPdfSections,
	type PdfReaderSource,
} from "@/lib/reader/pdf-source";
import { resolveInitialBookmark } from "@/lib/reader/resolve-bookmark";
import { loadReaderSettings } from "@/lib/reader/settings";
import type {
	ReaderBookData,
	ReaderBookmark,
	ReaderSourceFormat,
} from "@/lib/reader/types";
import { readerColumnHeight } from "@/lib/reader/viewport";
import { getCoverFilename, getCoverUrl } from "@/utils/covers";
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
			pdfSource?: PdfReaderSource;
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
	fileName?: string;
	pageCount?: number | null;
	sourceFormat?: ReaderSourceFormat;
	language?: string | null;
	contentForm?: "text" | "images" | null;
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
	fileName,
	pageCount,
	sourceFormat,
	language,
	contentForm,
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

				if (sourceFormat === "pdf") {
					if (!serverId)
						throw new Error("PDF reading requires a server connection");
					setLoadState({ phase: "parsing" });
					const { url } = await client.files.getReaderUrl({ uuid, serverId });
					if (cancelled) return;
					const serverProgress = await serverProgressPromise;
					if (cancelled) return;
					const initial = resolveInitialBookmark(
						loadLocalBookmark(uuid),
						serverProgress,
					);
					const expectedPageCount = Math.max(1, pageCount ?? 1);
					const sections = createPdfSections(expectedPageCount);
					const data: ReaderBookData = {
						uuid,
						sourceFormat: "pdf",
						contentForm: contentForm ?? "text",
						serverId,
						title: bookTitle,
						cover,
						language: language ?? "",
						elementHtml: "",
						styleSheet: "",
						blobs: {},
						characters: expectedPageCount,
						sections,
						storedAt: Date.now(),
					};
					onLoadedRef.current({ data, bookmark: initial });
					setLoadState({
						phase: "ready",
						data,
						html: "",
						bookmark: initial,
						pdfSource: {
							url,
							name: fileName ?? `${bookTitle}.pdf`,
							previewUrl: pdfPreviewUrl(cover),
						},
					});
					return;
				}

				const { data, written } = await fetchAndCacheBook(
					uuid,
					bookTitle,
					fileSizeBytes,
					serverId,
					{
						cover,
						sourceFormat,
						onDownloadProgress: (progress) => {
							if (!cancelled) setLoadState({ phase: "downloading", progress });
						},
						onParsing: () => {
							if (!cancelled) setLoadState({ phase: "parsing" });
						},
					},
				);
				// The downloads list only changes once the write lands; opening the
				// book never waits for it.
				void written.then(() =>
					queryClient.invalidateQueries({ queryKey: CACHED_BOOKS_QUERY_KEY }),
				);
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
					imageFitHeight,
				);
				const renderedData = { ...data, styleSheet: formatted.styleSheet };
				objectUrls.push(...formatted.objectUrls);
				if (cancelled) {
					for (const url of objectUrls) {
						URL.revokeObjectURL(url);
					}
					return;
				}

				onLoadedRef.current({ data: renderedData, bookmark: initial });
				setLoadState({
					phase: "ready",
					data: renderedData,
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

function pdfPreviewUrl(cover: string | null | undefined) {
	const filename = getCoverFilename(cover);
	return filename ? getCoverUrl(filename, 1_200) : undefined;
}
