import { ACTIVITY_TYPES, LISTENING_STATUSES } from "../../constants";
import { NotFoundError } from "../../errors";
import { markBookActivity } from "../../modules/presence/presence.service";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
import { activityRepository } from "../profile/profile.repository";
import { listeningProgressRepository } from "./listening-progress.repository";

export const saveProgress = async (
	userId: string,
	bookUuid: string,
	serverId: string | undefined,
	scope: LibraryScope,
	data: {
		currentTimeSeconds?: number;
		durationSeconds?: number;
		listeningTimeSeconds?: number;
		status?: string;
	},
) => {
	const bookRecord = await bookRepository.getByUuidAndMediaType(
		bookUuid,
		"audiobook",
		serverId,
		scope,
	);
	if (!bookRecord) throw new NotFoundError("Audiobook not found");
	const bookId = Number(bookRecord.id);

	const existing = await listeningProgressRepository.getByUserAndBook(
		userId,
		bookId,
	);
	const previousStatus = existing?.status;

	const result = await listeningProgressRepository.upsert(userId, bookId, data);

	if (
		data.status === LISTENING_STATUSES.LISTENING &&
		previousStatus !== LISTENING_STATUSES.LISTENING
	) {
		await activityRepository.insert(
			userId,
			ACTIVITY_TYPES.STARTED_LISTENING,
			bookId,
		);
	}
	if (
		data.status === LISTENING_STATUSES.COMPLETED &&
		previousStatus !== LISTENING_STATUSES.COMPLETED
	) {
		await activityRepository.insert(
			userId,
			ACTIVITY_TYPES.COMPLETED_LISTENING,
			bookId,
		);
	}

	if (data.status === LISTENING_STATUSES.LISTENING) {
		await markBookActivity(userId, bookId, bookUuid, "listening");
	}

	return result;
};

export const getProgress = async (
	userId: string,
	bookUuid: string,
	serverId?: string,
	scope: LibraryScope = "ALL",
) => {
	const bookRecord = await bookRepository.getByUuidAndMediaType(
		bookUuid,
		"audiobook",
		serverId,
		scope,
	);
	if (!bookRecord) throw new NotFoundError("Audiobook not found");

	return listeningProgressRepository.getByUserAndBook(
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
	return listeningProgressRepository.listInProgress(
		userId,
		limit,
		serverId,
		scope,
	);
};
