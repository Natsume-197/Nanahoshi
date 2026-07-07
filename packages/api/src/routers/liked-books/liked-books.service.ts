import { ACTIVITY_TYPES } from "../../constants";
import { NotFoundError } from "../../errors";
import { bookRepository } from "../books/book.repository";
import { activityRepository } from "../profile/profile.repository";
import { likedBooksRepository } from "./liked-books.repository";

export const toggleLike = async (
	userId: string,
	bookUuid: string,
	serverId: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, serverId);
	if (!bookRecord) throw new NotFoundError("Book not found");

	const bookId = Number(bookRecord.id);
	const isCurrentlyLiked = await likedBooksRepository.isLiked(
		userId,
		bookId,
		serverId,
	);

	if (isCurrentlyLiked) {
		await likedBooksRepository.remove(userId, bookId, serverId);
		await activityRepository.deleteByUserBookAndType(
			userId,
			bookId,
			ACTIVITY_TYPES.LIKED_BOOK,
		);
		return { liked: false };
	}

	await likedBooksRepository.insert(userId, bookId, serverId);
	await activityRepository.insert(userId, ACTIVITY_TYPES.LIKED_BOOK, bookId);
	return { liked: true };
};

export const getLikeStatus = async (
	userId: string,
	bookUuid: string,
	serverId: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, serverId);
	if (!bookRecord) throw new NotFoundError("Book not found");

	const liked = await likedBooksRepository.isLiked(
		userId,
		Number(bookRecord.id),
		serverId,
	);
	return { liked };
};

export const listLiked = async (
	userId: string,
	serverId: string,
	options: {
		limit: number;
		offset: number;
		sort: "recent" | "title" | "author";
		query?: string;
		format?: "books" | "audiobooks";
	},
) => {
	return likedBooksRepository.listLiked(userId, serverId, options);
};

export const countLiked = async (
	userId: string,
	serverId: string,
	format?: "books" | "audiobooks",
) => {
	return likedBooksRepository.count(userId, serverId, format);
};
