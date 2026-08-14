import {
	READER_POSITION_VERSION,
	type ReaderBookmark,
} from "@/lib/reader/types";
import type { ReadingPositionMode } from "./settings";

interface ServerReadingPosition {
	exploredCharCount: number;
	bookCharCount?: number;
	modifiedAt: number;
	positionMode?: ReadingPositionMode | null;
}

/**
 * Pick the freshest position from one local source and server-synced progress.
 * The caller decides whether that source is a manual marker or automatic
 * reading position before invoking this coordinate migration helper.
 *
 * At equal char counts the local copy wins: it also carries the pixel-exact
 * scroll offset, while the server stores the count alone (restoring by count
 * snaps back to the previous paragraph boundary), and the server's `lastReadAt`
 * keeps moving with every sync even when the bookmark itself didn't.
 */
export function resolveInitialBookmark(
	localBookmark: ReaderBookmark | undefined,
	serverProgress: ServerReadingPosition,
	currentBookCharCount?: number,
): ReaderBookmark | undefined {
	const migrateCount = (count: number, previousTotal?: number) =>
		currentBookCharCount && previousTotal && previousTotal > 0
			? Math.round((count / previousTotal) * currentBookCharCount)
			: count;
	const migratedLocal = localBookmark
		? localBookmark.positionVersion === READER_POSITION_VERSION ||
			!currentBookCharCount
			? localBookmark
			: {
					exploredCharCount: Math.round(
						Math.min(1, Math.max(0, localBookmark.progress || 0)) *
							currentBookCharCount,
					),
					progress: Math.min(1, Math.max(0, localBookmark.progress || 0)),
					lastBookmarkModified: localBookmark.lastBookmarkModified,
					positionVersion: READER_POSITION_VERSION,
				}
		: undefined;
	const serverBookmark: ReaderBookmark | undefined =
		serverProgress.exploredCharCount
			? {
					exploredCharCount: migrateCount(
						serverProgress.exploredCharCount,
						serverProgress.bookCharCount,
					),
					progress:
						serverProgress.bookCharCount && serverProgress.bookCharCount > 0
							? serverProgress.exploredCharCount / serverProgress.bookCharCount
							: 0,
					lastBookmarkModified: serverProgress.modifiedAt,
					positionVersion: READER_POSITION_VERSION,
				}
			: undefined;

	if (!migratedLocal || !serverBookmark) {
		return migratedLocal ?? serverBookmark;
	}

	const preferLocal =
		migratedLocal.exploredCharCount === serverBookmark.exploredCharCount ||
		(migratedLocal.lastBookmarkModified ?? 0) >
			serverBookmark.lastBookmarkModified;
	return preferLocal ? migratedLocal : serverBookmark;
}

/** Selects the independent resume source without conflating it with a marker. */
export function resolveReaderResumePosition({
	mode,
	manualBookmark,
	automaticPosition,
	serverProgress,
	currentBookCharCount,
}: {
	mode: ReadingPositionMode;
	manualBookmark: ReaderBookmark | undefined;
	automaticPosition: ReaderBookmark | undefined;
	serverProgress: ServerReadingPosition;
	currentBookCharCount?: number;
}): ReaderBookmark | undefined {
	// Null is legacy progress from before automatic resume existed, when the
	// server only stored manual markers. Each mode consumes only its own source.
	const serverMatchesMode =
		mode === "bookmark"
			? serverProgress.positionMode !== "automatic"
			: serverProgress.positionMode === "automatic";
	const matchingServerProgress = serverMatchesMode
		? serverProgress
		: { exploredCharCount: 0, bookCharCount: 0, modifiedAt: 0 };

	return resolveInitialBookmark(
		mode === "bookmark" ? manualBookmark : automaticPosition,
		matchingServerProgress,
		currentBookCharCount,
	);
}
