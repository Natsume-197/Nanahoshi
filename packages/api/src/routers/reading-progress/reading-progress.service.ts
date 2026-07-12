import { ACTIVITY_TYPES, READING_STATUSES } from "../../constants";
import { NotFoundError } from "../../errors";
import { markBookActivity } from "../../modules/presence/presence.service";
import { enqueueUserRefresh } from "../../modules/recommendations/recommendation.scheduler";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import { activityRepository } from "../profile/profile.repository";
import { readingProgressRepository } from "./reading-progress.repository";

export const saveProgress = async (
	userId: string,
	bookUuid: string,
	serverId: string | undefined,
	scope: LibraryScope,
	data: {
		exploredCharCount?: number;
		bookCharCount?: number;
		readingTimeSeconds?: number;
		status?: string;
	},
) => {
	if (!serverId) throw new NotFoundError("Book not found");
	const bookRecord = await bookRepository.getByUuidAndMediaType(
		bookUuid,
		"ebook",
		serverId,
		scope,
	);
	if (!bookRecord) throw new NotFoundError("Book not found");

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

	if (data.status === READING_STATUSES.READING) {
		await markBookActivity(userId, bookId, bookUuid, "reading");
	}

	// recommendation signals: completion (either direction) or crossing 50%
	const completionChanged =
		(data.status === READING_STATUSES.COMPLETED) !==
		(previousStatus === READING_STATUSES.COMPLETED);
	const prevRatio =
		existing?.bookCharCount && existing.bookCharCount > 0
			? (existing.exploredCharCount ?? 0) / existing.bookCharCount
			: 0;
	const newRatio =
		data.bookCharCount && data.bookCharCount > 0
			? (data.exploredCharCount ?? 0) / data.bookCharCount
			: prevRatio;
	if (completionChanged || (prevRatio < 0.5 && newRatio >= 0.5)) {
		await enqueueUserRefresh(serverId, userId);
	}

	return result;
};

export const getProgress = async (
	userId: string,
	bookUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	if (!serverId) throw new NotFoundError("Book not found");
	const bookRecord = await bookRepository.getByUuidAndMediaType(
		bookUuid,
		"ebook",
		serverId,
		scope,
	);
	if (!bookRecord) throw new NotFoundError("Book not found");

	return readingProgressRepository.getByUserAndBook(
		userId,
		Number(bookRecord.id),
	);
};

export const listInProgress = async (
	userId: string,
	limit = 20,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	if (!serverId) return [];
	return readingProgressRepository.listInProgress(
		userId,
		limit,
		serverId,
		scope,
	);
};
