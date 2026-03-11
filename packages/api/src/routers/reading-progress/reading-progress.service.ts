import { NotFoundError } from "../../errors";
import { ACTIVITY_TYPES, READING_STATUSES } from "../../constants";
import { bookRepository } from "../books/book.repository";
import { activityRepository } from "../profile/profile.repository";
import { readingProgressRepository } from "./reading-progress.repository";

export const saveProgress = async (
	userId: string,
	bookUuid: string,
	organizationId: string | undefined,
	data: {
		ttuBookId?: number;
		exploredCharCount?: number;
		bookCharCount?: number;
		readingTimeSeconds?: number;
		status?: string;
	},
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord)
		throw new NotFoundError("Book not found");

	const bookId = Number(bookRecord.id);

	const existing = await readingProgressRepository.getByUserAndBook(
		userId,
		bookId,
	);
	const previousStatus = existing?.status;

	const result = await readingProgressRepository.upsert(userId, bookId, data);

	if (
		data.status === READING_STATUSES.READING &&
		previousStatus !== READING_STATUSES.READING
	) {
		await activityRepository.insert(
			userId,
			ACTIVITY_TYPES.STARTED_READING,
			bookId,
		);
	}
	if (
		data.status === READING_STATUSES.COMPLETED &&
		previousStatus !== READING_STATUSES.COMPLETED
	) {
		await activityRepository.insert(
			userId,
			ACTIVITY_TYPES.COMPLETED_READING,
			bookId,
		);
	}

	return result;
};

export const getProgress = async (
	userId: string,
	bookUuid: string,
	organizationId?: string,
) => {
	const bookRecord = await bookRepository.getByUuid(bookUuid, organizationId);
	if (!bookRecord)
		throw new NotFoundError("Book not found");

	return readingProgressRepository.getByUserAndBook(
		userId,
		Number(bookRecord.id),
	);
};

export const listInProgress = async (
	userId: string,
	limit = 20,
	organizationId?: string,
) => {
	if (!organizationId) return [];
	return readingProgressRepository.listInProgress(
		userId,
		limit,
		organizationId,
	);
};
