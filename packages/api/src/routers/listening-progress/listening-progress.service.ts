import { ACTIVITY_TYPES, LISTENING_STATUSES } from "../../constants";
import { NotFoundError } from "../../errors";
import { bookRepository } from "../books/book.repository";
import { activityRepository } from "../profile/profile.repository";
import { listeningProgressRepository } from "./listening-progress.repository";

export const saveProgress = async (
	userId: string,
	bookUuid: string,
	_serverId: string | undefined,
	data: {
		currentTimeSeconds?: number;
		durationSeconds?: number;
		listeningTimeSeconds?: number;
		status?: string;
	},
) => {
	const bookId = await bookRepository.getIdByUuid(bookUuid);
	if (bookId === null) throw new NotFoundError("Audiobook not found");

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

	return result;
};

export const getProgress = async (
	userId: string,
	bookUuid: string,
	_serverId?: string,
) => {
	const bookId = await bookRepository.getIdByUuid(bookUuid);
	if (bookId === null) throw new NotFoundError("Audiobook not found");

	return listeningProgressRepository.getByUserAndBook(userId, bookId);
};

export const listInProgress = async (
	userId: string,
	limit = 20,
	serverId?: string,
) => {
	if (!serverId) return [];
	return listeningProgressRepository.listInProgress(userId, limit, serverId);
};
