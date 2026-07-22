import { bookRepository } from "../../routers/books/book.repository";
import { profileRepository } from "../../routers/profile/profile.repository";
import * as presence from "./presenceManager";

// Resolve the book title and mark reading/listening presence (invisible mode is
// honored inside markActivity). Users who opted out of sharing their reading
// activity stay plain online/away — the activity key is never written for them.
// Best-effort: a presence failure must never break progress saving.
export async function markBookActivity(
	userId: string,
	bookId: number,
	bookUuid: string,
	kind: "reading" | "listening",
): Promise<void> {
	try {
		const [title, shareActivity] = await Promise.all([
			bookRepository.getTitleById(bookId),
			profileRepository.getShareReadingActivity(userId),
		]);
		if (!shareActivity) return;
		await presence.markActivity(userId, kind, {
			uuid: bookUuid,
			title: title ?? "",
		});
	} catch {}
}
