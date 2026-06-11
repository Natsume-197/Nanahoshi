import type { ReaderBookmark } from "@/lib/reader/types";

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
	serverProgress: { exploredCharCount: number; modifiedAt: number },
): ReaderBookmark | undefined {
	const serverBookmark: ReaderBookmark | undefined =
		serverProgress.exploredCharCount
			? {
					exploredCharCount: serverProgress.exploredCharCount,
					progress: 0,
					lastBookmarkModified: serverProgress.modifiedAt,
				}
			: undefined;

	if (!localBookmark || !serverBookmark) {
		return localBookmark ?? serverBookmark;
	}

	const preferLocal =
		localBookmark.exploredCharCount === serverBookmark.exploredCharCount ||
		(localBookmark.lastBookmarkModified ?? 0) >
			serverBookmark.lastBookmarkModified;
	return preferLocal ? localBookmark : serverBookmark;
}
