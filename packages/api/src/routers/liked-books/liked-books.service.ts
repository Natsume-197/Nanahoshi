import { NotFoundError } from "../../errors";
import { ACTIVITY_TYPES } from "../../constants";
import { bookRepository } from "../books/book.repository";
import { activityRepository } from "../profile/profile.repository";
import { likedBooksRepository } from "./liked-books.repository";

export const toggleLike = async (
	userId: string,
	bookUuid: string,
	organizationId: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord)
		throw new NotFoundError("Book not found");

	const bookId = Number(bookRecord.id);
	const isCurrentlyLiked = await likedBooksRepository.isLiked(userId, bookId, organizationId);

	if (isCurrentlyLiked) {
		await likedBooksRepository.remove(userId, bookId, organizationId);
		await activityRepository.deleteByUserBookAndType(
			userId,
			bookId,
			ACTIVITY_TYPES.LIKED_BOOK,
		);
		return { liked: false };
	}

	await likedBooksRepository.insert(userId, bookId, organizationId);
	await activityRepository.insert(userId, ACTIVITY_TYPES.LIKED_BOOK, bookId);
	return { liked: true };
};

export const getLikeStatus = async (
	userId: string,
	bookUuid: string,
	organizationId: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord)
		throw new NotFoundError("Book not found");

	const liked = await likedBooksRepository.isLiked(
		userId,
		Number(bookRecord.id),
		organizationId,
	);
	return { liked };
};

export const listLiked = async (
	userId: string,
	limit = 20,
	organizationId: string,
) => {
	return likedBooksRepository.listLiked(userId, limit, organizationId);
};
