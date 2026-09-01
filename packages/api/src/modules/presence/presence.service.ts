import { bookRepository } from "../../routers/books/book.repository";
import { profileRepository } from "../../routers/profile/profile.repository";
import * as presence from "./presenceManager";

// Resolve the book title and mark reading/listening presence (invisible mode is
// honored inside markActivity). Users who opted out of sharing their reading
// activity stay plain online/away — the activity key is never written for them.
// Best-effort: a presence failure must never break progress saving.
export async function markBookActivity(
	userId: string,
	sessionId: string,
	bookId: number,
	bookUuid: string,
	kind: "reading" | "listening",
	progress?: {
		currentTimeSeconds?: number;
		durationSeconds?: number;
		playbackRate?: number;
	},
): Promise<void> {
	try {
		const [title, cover, shareActivity] = await Promise.all([
			bookRepository.getTitleById(bookId),
			bookRepository.getCoverById(bookId),
			profileRepository.getShareReadingActivity(userId),
		]);
		if (!shareActivity || !title) return;
		await presence.markActivity(userId, sessionId, kind, {
			uuid: bookUuid,
			title,
			cover,
			...(kind === "listening" &&
				Number.isFinite(progress?.currentTimeSeconds) &&
				Number.isFinite(progress?.durationSeconds) &&
				(progress?.durationSeconds ?? 0) > 0 && {
					progress: {
						currentTimeSeconds: Math.max(0, progress?.currentTimeSeconds ?? 0),
						durationSeconds: progress?.durationSeconds ?? 0,
						updatedAt: Date.now(),
						playbackRate: Math.max(0.1, progress?.playbackRate ?? 1),
					},
				}),
		});
	} catch {}
}

/** Mark the synchronized reader as its own activity, rather than letting its
 * reading and playback heartbeats overwrite one another. */
export async function markReadListenActivity(
	userId: string,
	sessionId: string,
	book: presence.PresenceBook,
): Promise<void> {
	try {
		if (!(await profileRepository.getShareReadingActivity(userId))) return;
		await presence.markActivity(userId, sessionId, "read_listen", book);
	} catch {}
}
