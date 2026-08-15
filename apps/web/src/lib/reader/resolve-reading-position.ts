import { READER_POSITION_VERSION, type ReaderPosition } from "./types";

interface ServerReadingPosition {
	exploredCharCount: number;
	bookCharCount?: number;
	modifiedAt: number;
}

/**
 * Picks the freshest reading position between the local copy and server-synced
 * progress, migrating either onto the book length as parsed right now.
 *
 * At equal char counts the local copy wins: it also carries the pixel-exact
 * scroll offset, while the server stores the count alone (restoring by count
 * snaps back to the previous paragraph boundary), and the server's `lastReadAt`
 * keeps moving with every sync even when the position itself didn't.
 */
export function resolveReadingPosition(
	local: ReaderPosition | undefined,
	serverProgress: ServerReadingPosition,
	currentBookCharCount?: number,
): ReaderPosition | undefined {
	const rescale = (count: number, previousTotal?: number) =>
		currentBookCharCount && previousTotal && previousTotal > 0
			? Math.round((count / previousTotal) * currentBookCharCount)
			: count;

	const migratedLocal = local
		? local.positionVersion === READER_POSITION_VERSION || !currentBookCharCount
			? local
			: {
					exploredCharCount: Math.round(
						Math.min(1, Math.max(0, local.progress || 0)) *
							currentBookCharCount,
					),
					progress: Math.min(1, Math.max(0, local.progress || 0)),
					modifiedAt: local.modifiedAt,
					positionVersion: READER_POSITION_VERSION,
				}
		: undefined;

	const remote: ReaderPosition | undefined = serverProgress.exploredCharCount
		? {
				exploredCharCount: rescale(
					serverProgress.exploredCharCount,
					serverProgress.bookCharCount,
				),
				progress:
					serverProgress.bookCharCount && serverProgress.bookCharCount > 0
						? serverProgress.exploredCharCount / serverProgress.bookCharCount
						: 0,
				modifiedAt: serverProgress.modifiedAt,
				positionVersion: READER_POSITION_VERSION,
			}
		: undefined;

	if (!migratedLocal || !remote) return migratedLocal ?? remote;

	const preferLocal =
		migratedLocal.exploredCharCount === remote.exploredCharCount ||
		(migratedLocal.modifiedAt ?? 0) > remote.modifiedAt;
	return preferLocal ? migratedLocal : remote;
}
