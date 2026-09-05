import { useEffect, useRef, useState } from "react";
import type { LazyHtmlBook } from "@/features/reader/document/lazy-html-book";
import {
	type LoadedReaderBook,
	loadBookForReader,
} from "@/features/reader/document/load-book";
import {
	createPdfSections,
	type PdfReaderSource,
} from "@/features/reader/document/pdf-source";
import { formatBookDataHtml } from "@/features/reader/document/processing/format-book-data-html";
import type {
	ReaderBookData,
	ReaderPosition,
	ReaderSourceFormat,
} from "@/features/reader/document/types";
import type { ReaderSettings } from "@/features/reader/presentation/settings";
import { readerColumnHeight } from "@/features/reader/renderers/shared/viewport";
import { resolveReadingPosition } from "@/features/reader/session/reader-position";
import { loadLocalReadingPosition } from "@/features/reader/session/reader-session";
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
			lazyBook?: LazyHtmlBook;
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
	fileHash?: string | null;
	fileName?: string;
	pageCount?: number | null;
	sourceFormat?: ReaderSourceFormat;
	language?: string | null;
	contentForm?: "text" | "images" | null;
	/** Paginated and virtualized continuous consume lazy sections. */
	allowLazySections: boolean;
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
	fileHash,
	fileName,
	pageCount,
	sourceFormat,
	language,
	contentForm,
	allowLazySections,
	readerSettings,
	onLoaded,
}: UseBookLoaderArgs): LoadState {
	const [loadState, setLoadState] = useState<LoadState>({ phase: "loading" });
	const onLoadedRef = useRef(onLoaded);
	onLoadedRef.current = onLoaded;

	// The reader may change engine without leaving the route. Re-run only when
	// its required document form changes: lazy sections for paginated/continuous,
	// complete HTML for Focus and Read & Listen.
	// biome-ignore lint/correctness/useExhaustiveDependencies: all other inputs identify the same book and are stable for this route
	useEffect(() => {
		let cancelled = false;
		const controller = new AbortController();
		const { signal } = controller;
		const objectUrls: string[] = [];
		let bookSession: LoadedReaderBook | undefined;

		(async () => {
			try {
				const localPosition = loadLocalReadingPosition(uuid);
				// Server progress is fetched in parallel with download and parsing.
				const serverProgressPromise = client.readingProgress
					.getProgress({ bookUuid: uuid }, { signal })
					.then((progress) => ({
						exploredCharCount: progress?.exploredCharCount ?? 0,
						bookCharCount: progress?.bookCharCount ?? 0,
						// The server commits position writes by this intent clock. A
						// response timestamp is only transport timing and can otherwise
						// make an older device look newer after a delayed sync.
						modifiedAt:
							progress?.positionIntentAt ??
							(progress?.positionUpdatedAt
								? new Date(progress.positionUpdatedAt).getTime()
								: progress?.lastReadAt
									? new Date(progress.lastReadAt).getTime()
									: 0),
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
					const { url } = await client.files.getReaderUrl(
						{ uuid, serverId },
						{ signal },
					);
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
						title: bookTitle,
						cover,
						language: language ?? "",
						elementHtml: "",
						styleSheet: "",
						blobs: {},
						characters: expectedPageCount,
						sections,
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

				bookSession = await loadBookForReader({
					uuid,
					bookTitle,
					cover,
					fileSizeBytes,
					fileHash,
					fileName,
					serverId,
					sourceFormat,
					allowLazySections,
					signal,
					callbacks: {
						onDownloadProgress: (progress) => {
							if (!cancelled) setLoadState({ phase: "downloading", progress });
						},
						onParsing: () => {
							if (!cancelled) setLoadState({ phase: "parsing" });
						},
					},
				});
				if (cancelled) {
					await bookSession.dispose();
					return;
				}
				const { data, lazyBook } = bookSession;

				const serverProgress = await serverProgressPromise;
				if (cancelled) return;
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
				const formatted = lazyBook
					? undefined
					: await formatBookDataHtml(data, document, imageFitHeight);
				const renderedData = formatted
					? { ...data, styleSheet: formatted.styleSheet }
					: data;
				if (formatted) objectUrls.push(...formatted.objectUrls);
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
					html: formatted?.elementHtml ?? "",
					position,
					lazyBook,
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
			controller.abort();
			for (const url of objectUrls) {
				URL.revokeObjectURL(url);
			}
			void bookSession?.dispose();
		};
		// The reader route is outside DashboardLayout. On a cold SSR navigation the
		// active organization is available only after the auth client hydrates; retry
		// the load when that server id arrives instead of permanently retaining the
		// initial “requires a server connection” error.
	}, [uuid, allowLazySections, serverId]);

	return loadState;
}

function pdfPreviewUrl(cover: string | null | undefined) {
	const filename = getCoverFilename(cover);
	return filename ? getCoverUrl(filename, 1_200) : undefined;
}
