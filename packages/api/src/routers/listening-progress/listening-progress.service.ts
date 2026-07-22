import { LISTENING_STATUSES } from "../../constants";
import { NotFoundError } from "../../errors";
import { markBookActivity } from "../../modules/presence/presence.service";
import { enqueueUserRefresh } from "../../modules/recommendations/recommendation.scheduler";
import type { LibraryScope } from "../_shared/library-scope";
import { bookRepository } from "../books/book.repository";
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
	if (!serverId) throw new NotFoundError("Audiobook not found");
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

	if (data.status === LISTENING_STATUSES.LISTENING) {
		await markBookActivity(userId, bookId, bookUuid, "listening");
	}

	// recommendation signals: completion (either direction) or crossing 50%
	const completionChanged =
		(data.status === LISTENING_STATUSES.COMPLETED) !==
		(previousStatus === LISTENING_STATUSES.COMPLETED);
	const prevRatio =
		existing?.durationSeconds && existing.durationSeconds > 0
			? (existing.currentTimeSeconds ?? 0) / existing.durationSeconds
			: 0;
	const newRatio =
		data.durationSeconds && data.durationSeconds > 0
			? (data.currentTimeSeconds ?? 0) / data.durationSeconds
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
	if (!serverId) throw new NotFoundError("Audiobook not found");
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
