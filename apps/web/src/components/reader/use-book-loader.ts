import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { formatBookDataHtml } from "@/lib/reader/format-book-data-html";
import { loadBookForReader } from "@/lib/reader/load-book";
import { loadLocalReadingPosition } from "@/lib/reader/local-reading-position";
import {
	createPdfSections,
	type PdfReaderSource,
} from "@/lib/reader/pdf-source";
import { resolveReadingPosition } from "@/lib/reader/resolve-reading-position";
import type { ReaderSettings } from "@/lib/reader/settings";
import type {
	ReaderBookData,
	ReaderPosition,
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
			position: ReaderPosition | undefined;
			pdfSource?: PdfReaderSource;
	  };

interface UseBookLoaderArgs {
	uuid: string;
	bookTitle: string;
	cover?: string | null;
	/** Server that authorizes and serves this reading session. */
	serverId: string | null;
	/** File size in bytes from the book metadata, used as the download progress
	 *  total when the response omits Content-Length (chunked transfer). */
	fileSizeBytes?: number;
	fileName?: string;
	pageCount?: number | null;
	sourceFormat?: ReaderSourceFormat;
	language?: string | null;
	contentForm?: "text" | "images" | null;
	readerSettings: Pick<
		ReaderSettings,
		"writingMode" | "secondDimensionMaxValue"
	>;
	/** Called once the book is parsed and the restore position is resolved,
	 *  before the reader renders. */
	onLoaded: (result: {
		data: ReaderBookData;
		position: ReaderPosition | undefined;
		positionClockAt: number;
	}) => void;
}

/**
 * Downloads and parses a book for the active reader session, formats the HTML,
 * and resolves the reading marker and automatic position against server progress.
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
	readerSettings,
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
				const localPosition = loadLocalReadingPosition(uuid);
				// Server progress is fetched in parallel with download and parsing.
				const serverProgressPromise = client.readingProgress
					.getProgress({ bookUuid: uuid })
					.then((progress) => ({
						exploredCharCount: progress?.exploredCharCount ?? 0,
						bookCharCount: progress?.bookCharCount ?? 0,
						modifiedAt: progress?.positionUpdatedAt
							? new Date(progress.positionUpdatedAt).getTime()
							: progress?.lastReadAt
								? new Date(progress.lastReadAt).getTime()
								: 0,
					}))
					.catch(() => ({
						exploredCharCount: 0,
						bookCharCount: 0,
						modifiedAt: 0,
					}));

				if (sourceFormat === "pdf") {
					if (!serverId)
						throw new Error("PDF reading requires a server connection");
					setLoadState({ phase: "parsing" });
					const { url } = await client.files.getReaderUrl({ uuid, serverId });
					if (cancelled) return;
					const serverProgress = await serverProgressPromise;
					if (cancelled) return;
					const expectedPageCount = Math.max(1, pageCount ?? 1);
					const position = resolveReadingPosition(
						localPosition,
						serverProgress,
						expectedPageCount,
					);
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
					onLoadedRef.current({
						data,
						position,
						positionClockAt: Math.max(
							serverProgress.modifiedAt,
							localPosition?.modifiedAt ?? 0,
						),
					});
					setLoadState({
						phase: "ready",
						data,
						html: "",
						position,
						pdfSource: {
							url,
							name: fileName ?? `${bookTitle}.pdf`,
							previewUrl: pdfPreviewUrl(cover),
						},
					});
					return;
				}

				const data = await loadBookForReader({
					uuid,
					bookTitle,
					cover,
					fileSizeBytes,
					serverId,
					sourceFormat,
					callbacks: {
						onDownloadProgress: (progress) => {
							if (!cancelled) setLoadState({ phase: "downloading", progress });
						},
						onParsing: () => {
							if (!cancelled) setLoadState({ phase: "parsing" });
						},
					},
				});
				if (cancelled) return;

				const serverProgress = await serverProgressPromise;
				const position = resolveReadingPosition(
					localPosition,
					serverProgress,
					data.characters,
				);
				// Mirrors the max-height caps in reader.css (100vh, and
				// --book-content-child-height in vertical mode).
				const imageFitHeight = readerColumnHeight(
					readerSettings.writingMode === "vertical-rl",
					readerSettings.secondDimensionMaxValue,
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

				onLoadedRef.current({
					data: renderedData,
					position,
					positionClockAt: Math.max(
						serverProgress.modifiedAt,
						localPosition?.modifiedAt ?? 0,
					),
				});
				setLoadState({
					phase: "ready",
					data: renderedData,
					html: formatted.elementHtml,
					position,
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
