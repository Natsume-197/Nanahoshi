import { ORPCError } from "@orpc/server";
import { ACTIVITY_TYPES } from "../../constants";
import { bookRepository } from "../books/book.repository";
import { activityRepository } from "../profile/profile.repository";
import { likedBooksRepository } from "./liked-books.repository";

export const toggleLike = async (userId: string, bookUuid: string) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid);
	if (!bookRecord)
		throw new ORPCError("NOT_FOUND", { message: "Book not found" });

	const bookId = Number(bookRecord.id);
	const isCurrentlyLiked = await likedBooksRepository.isLiked(userId, bookId);

	if (isCurrentlyLiked) {
		await likedBooksRepository.remove(userId, bookId);
		await activityRepository.deleteByUserBookAndType(
			userId,
			bookId,
			ACTIVITY_TYPES.LIKED_BOOK,
		);
		return { liked: false };
	}

	await likedBooksRepository.insert(userId, bookId);
	await activityRepository.insert(userId, ACTIVITY_TYPES.LIKED_BOOK, bookId);
	return { liked: true };
};

export const getLikeStatus = async (userId: string, bookUuid: string) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid);
	if (!bookRecord)
		throw new ORPCError("NOT_FOUND", { message: "Book not found" });

	const liked = await likedBooksRepository.isLiked(
		userId,
		Number(bookRecord.id),
	);
	return { liked };
};

export const listLiked = async (userId: string, limit = 20) => {
	return likedBooksRepository.listLiked(userId, limit);
};
