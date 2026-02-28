import { bookRepository } from "../books/book.repository";
import { activityRepository } from "../profile/profile.repository";
import { readingProgressRepository } from "./reading-progress.repository";

export const saveProgress = async (
	userId: string,
	bookUuid: string,
	data: {
		ttuBookId?: number;
		exploredCharCount?: number;
		bookCharCount?: number;
		readingTimeSeconds?: number;
		status?: string;
	},
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid);
	if (!bookRecord) throw new Error("Book not found");

	const bookId = Number(bookRecord.id);

	const existing = await readingProgressRepository.getByUserAndBook(
		userId,
		bookId,
	);
	const previousStatus = existing?.status;

	const result = await readingProgressRepository.upsert(userId, bookId, data);

	if (data.status === "reading" && previousStatus !== "reading") {
		await activityRepository.insert(userId, "started_reading", bookId);
	}
	if (data.status === "completed" && previousStatus !== "completed") {
		await activityRepository.insert(userId, "completed_reading", bookId);
	}

	return result;
};

export const getProgress = async (userId: string, bookUuid: string) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid);
	if (!bookRecord) throw new Error("Book not found");

	return readingProgressRepository.getByUserAndBook(
		userId,
		Number(bookRecord.id),
	);
};

export const listInProgress = async (userId: string, limit = 20) => {
	return readingProgressRepository.listInProgress(userId, limit);
};
