import type { ListStatus } from "../../constants";
import { NotFoundError } from "../../errors";
import { bookRepository } from "../books/book.repository";
import { bookShelfRepository } from "./book-shelf.repository";

export const setShelfStatus = async (
	userId: string,
	bookUuid: string,
	status: ListStatus,
	organizationId?: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord) throw new NotFoundError("Book not found");

	return bookShelfRepository.upsert(userId, Number(bookRecord.id), status);
};

export const getShelfStatus = async (
	userId: string,
	bookUuid: string,
	organizationId?: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord) throw new NotFoundError("Book not found");

	return bookShelfRepository.getByUserAndBook(userId, Number(bookRecord.id));
};

export const removeShelfStatus = async (
	userId: string,
	bookUuid: string,
	organizationId?: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord) throw new NotFoundError("Book not found");

	await bookShelfRepository.remove(userId, Number(bookRecord.id));
};

export const listShelf = async (
	userId: string,
	organizationId: string | undefined,
	status?: ListStatus,
	limit = 50,
) => {
	if (!organizationId) return [];
	return bookShelfRepository.listByStatus(
		userId,
		organizationId,
		status,
		limit,
	);
};

export const listPublicShelf = async (
	username: string,
	organizationId: string | undefined,
	status?: ListStatus,
	limit = 50,
) => {
	if (!organizationId) return [];
	const userId = await bookShelfRepository.getUserIdByUsername(username);
	if (!userId) return [];
	return bookShelfRepository.listByStatus(
		userId,
		organizationId,
		status,
		limit,
	);
};

export const listPublicShelfPaginated = async (
	username: string,
	organizationId: string | undefined,
	status?: ListStatus,
	limit = 40,
	offset = 0,
) => {
	if (!organizationId) return { items: [], total: 0 };
	const userId = await bookShelfRepository.getUserIdByUsername(username);
	if (!userId) return { items: [], total: 0 };
	return bookShelfRepository.listPaginated(
		userId,
		organizationId,
		status,
		limit,
		offset,
	);
};
