import { bookRepository } from "../../routers/books/book.repository";
import * as presence from "./presenceManager";

// Resolve the book title and mark reading/listening presence (invisible mode is
// honored inside markActivity). Best-effort: a presence failure must never break
// progress saving.
export async function markBookActivity(
	userId: string,
	bookId: number,
	bookUuid: string,
	kind: "reading" | "listening",
): Promise<void> {
	try {
		const title = await bookRepository.getTitleById(bookId);
		await presence.markActivity(userId, kind, {
			uuid: bookUuid,
			title: title ?? "",
		});
	} catch {}
}
