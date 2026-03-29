import { NotFoundError } from "../../errors";
import { bookRepository } from "../books/book.repository";
import { audiobookShelfRepository } from "./audiobook-shelf.repository";

async function resolveBookId(bookUuid: string): Promise<number> {
	const id = await bookRepository.getIdByUuid(bookUuid);
	if (id === null) throw new NotFoundError("Audiobook not found");
	return id;
}

export const setShelfStatus = async (
	userId: string,
	bookUuid: string,
	status: string,
) => {
	const bookId = await resolveBookId(bookUuid);
	return audiobookShelfRepository.upsert(userId, bookId, status);
};

export const getShelfStatus = async (userId: string, bookUuid: string) => {
	const bookId = await resolveBookId(bookUuid);
	return audiobookShelfRepository.getByUserAndBook(userId, bookId);
};

export const removeShelfStatus = async (userId: string, bookUuid: string) => {
	const bookId = await resolveBookId(bookUuid);
	await audiobookShelfRepository.remove(userId, bookId);
	return { success: true };
};

export const listShelf = async (
	userId: string,
	organizationId: string,
	status?: string,
	limit?: number,
) => {
	return audiobookShelfRepository.listByStatus(
		userId,
		organizationId,
		status,
		limit,
	);
};
