import { bookRepository } from "../books/book.repository";
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

	return readingProgressRepository.upsert(userId, Number(bookRecord.id), data);
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
