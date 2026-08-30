import { READING_STATUSES } from "../../constants";
import { NotFoundError } from "../../errors";
import { markActivePlayback } from "../../modules/instance-activity/playback.manager";
import { markBookActivity } from "../../modules/presence/presence.service";
import { enqueueUserRefresh } from "../../modules/recommendations/recommendation.scheduler";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import { readingProgressRepository } from "./reading-progress.repository";

export const saveProgress = async (
	userId: string,
	bookUuid: string,
	serverId: string | undefined,
	scope: LibraryScope,
	data: {
		exploredCharCount?: number;
		bookCharCount?: number;
		positionIntentAt?: number;
		readingTimeSeconds?: number;
		status?: string;
	},
	session?: {
		sessionId: string;
		userName: string;
		userImage: string | null;
		device: string | null;
		ipAddress: string | null;
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

	const { progress: result, positionAccepted } =
		await readingProgressRepository.upsert(userId, bookId, data);

	if (positionAccepted && data.status === READING_STATUSES.READING) {
		await markBookActivity(userId, bookId, bookUuid, "reading");
		if (session)
			void bookRepository
				.getTitleById(bookId)
				.then((bookTitle) =>
					bookTitle
						? markActivePlayback({
								sessionId: session.sessionId,
								userId,
								userName: session.userName,
								userImage: session.userImage,
								device: session.device,
								ipAddress: session.ipAddress,
								serverId,
								bookUuid,
								bookTitle,
								kind: "reading",
								progress:
									result.bookCharCount && result.bookCharCount > 0
										? (result.exploredCharCount ?? 0) / result.bookCharCount
										: null,
							})
						: undefined,
				)
				.catch(() => {});
	}

	// recommendation signals: completion (either direction) or crossing 50%
	const completionChanged =
		(result.status === READING_STATUSES.COMPLETED) !==
		(previousStatus === READING_STATUSES.COMPLETED);
	const prevRatio =
		existing?.bookCharCount && existing.bookCharCount > 0
			? (existing.exploredCharCount ?? 0) / existing.bookCharCount
			: 0;
	const newRatio =
		result.bookCharCount && result.bookCharCount > 0
			? (result.exploredCharCount ?? 0) / result.bookCharCount
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
