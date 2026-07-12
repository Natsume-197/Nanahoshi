import { NotFoundError } from "../../errors";
import { enqueueUserRefresh } from "../../modules/recommendations/recommendation.scheduler";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import { audiobookShelfRepository } from "./audiobook-shelf.repository";

async function resolveBookId(
	bookUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
): Promise<number> {
	const book = await bookRepository.getByUuidAndMediaType(
		bookUuid,
		"audiobook",
		serverId,
		scope,
	);
	if (!book) throw new NotFoundError("Audiobook not found");
	return Number(book.id);
}

export const setShelfStatus = async (
	userId: string,
	bookUuid: string,
	status: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const bookId = await resolveBookId(bookUuid, serverId, scope);
	const result = await audiobookShelfRepository.upsert(userId, bookId, status);
	if (serverId) await enqueueUserRefresh(serverId, userId);
	return result;
};

export const getShelfStatus = async (
	userId: string,
	bookUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const bookId = await resolveBookId(bookUuid, serverId, scope);
	return audiobookShelfRepository.getByUserAndBook(userId, bookId);
};

export const removeShelfStatus = async (
	userId: string,
	bookUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const bookId = await resolveBookId(bookUuid, serverId, scope);
	await audiobookShelfRepository.remove(userId, bookId);
	if (serverId) await enqueueUserRefresh(serverId, userId);
	return { success: true };
};

export const listShelf = async (
	userId: string,
	serverId: string,
	scope: LibraryScope = "ALL",
	status?: string,
	limit?: number,
) => {
	return audiobookShelfRepository.listByStatus(
		userId,
		serverId,
		scope,
		status,
		limit,
	);
};
