import {
	READER_POSITION_VERSION,
	type ReaderBookmark,
} from "@/lib/reader/types";

/**
 * Pick the reading position to restore from the locally saved bookmark and the
 * server-synced progress. The bookmark is the single source of truth; the
 * server copy only carries the char count for cross-device restore.
 *
 * At equal char counts the local copy wins: it also carries the pixel-exact
 * scroll offset, while the server stores the count alone (restoring by count
 * snaps back to the previous paragraph boundary), and the server's `lastReadAt`
 * keeps moving with every sync even when the bookmark itself didn't.
 */
export function resolveInitialBookmark(
	localBookmark: ReaderBookmark | undefined,
	serverProgress: {
		exploredCharCount: number;
		bookCharCount?: number;
		modifiedAt: number;
	},
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
