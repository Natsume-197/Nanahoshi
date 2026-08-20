import type { ListStatus } from "../../constants";
import { NotFoundError } from "../../errors";
import { enqueueUserRefresh } from "../../modules/recommendations/recommendation.scheduler";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import { membersRepository } from "../members/members.repository";
import { bookShelfRepository } from "./book-shelf.repository";

export const setShelfStatus = async (
	userId: string,
	bookUuid: string,
	status: ListStatus,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const bookRecord = await bookRepository.getByUuidAndMediaType(
		bookUuid,
		"ebook",
		serverId,
		scope,
	);
	if (!bookRecord) throw new NotFoundError("Book not found");

	const result = await bookShelfRepository.upsert(
		userId,
		Number(bookRecord.id),
		status,
	);
	if (serverId) await enqueueUserRefresh(serverId, userId);
	return result;
};

export const getShelfStatus = async (
	userId: string,
	bookUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const bookRecord = await bookRepository.getByUuidAndMediaType(
		bookUuid,
		"ebook",
		serverId,
		scope,
	);
	if (!bookRecord) throw new NotFoundError("Book not found");

	return bookShelfRepository.getByUserAndBook(userId, Number(bookRecord.id));
};

export const removeShelfStatus = async (
	userId: string,
	bookUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const bookRecord = await bookRepository.getByUuidAndMediaType(
		bookUuid,
		"ebook",
		serverId,
		scope,
	);
	if (!bookRecord) throw new NotFoundError("Book not found");

	await bookShelfRepository.remove(userId, Number(bookRecord.id));
	if (serverId) await enqueueUserRefresh(serverId, userId);
};

export const listShelf = async (
	userId: string,
	serverId: string | undefined,
	scope: LibraryScope,
	status?: ListStatus,
	limit = 50,
) => {
	if (!serverId) return [];
	return bookShelfRepository.listByStatus(
		userId,
		serverId,
		scope,
		status,
		limit,
	);
};

export const listPublicShelf = async (
	username: string,
	serverId: string | undefined,
	scope: LibraryScope,
	status?: ListStatus,
	limit = 50,
) => {
	if (!serverId) return [];
	const userId = await bookShelfRepository.getUserIdByUsername(username);
	if (!userId) return [];
	if (!(await membersRepository.isMember(userId, serverId))) return [];
	return bookShelfRepository.listByStatus(
		userId,
		serverId,
		scope,
		status,
		limit,
	);
};

export const listPublicShelfPaginated = async (
	username: string,
	serverId: string | undefined,
	scope: LibraryScope,
	status?: ListStatus,
	limit = 40,
	offset = 0,
) => {
	if (!serverId) return { items: [], total: 0 };
	const userId = await bookShelfRepository.getUserIdByUsername(username);
	if (!userId) return { items: [], total: 0 };
	if (!(await membersRepository.isMember(userId, serverId))) {
		return { items: [], total: 0 };
	}
	return bookShelfRepository.listPaginated(
		userId,
		serverId,
		scope,
		status,
		limit,
		offset,
	);
};
