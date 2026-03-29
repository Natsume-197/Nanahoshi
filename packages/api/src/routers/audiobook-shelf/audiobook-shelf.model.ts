import type { userAudiobookShelf } from "@nanahoshi-v2/db/schema/general";
import { z } from "zod";
import { AUDIOBOOK_SHELF_STATUSES } from "../../constants";

export type UserAudiobookShelf = typeof userAudiobookShelf.$inferSelect;
export type CreateUserAudiobookShelf = typeof userAudiobookShelf.$inferInsert;

export const SetAudiobookShelfInput = z.object({
	bookUuid: z.string(),
	status: z.enum([
		AUDIOBOOK_SHELF_STATUSES.WANT_TO_LISTEN,
		AUDIOBOOK_SHELF_STATUSES.BACKLOG,
		AUDIOBOOK_SHELF_STATUSES.LISTENING,
		AUDIOBOOK_SHELF_STATUSES.COMPLETED,
	]),
});

export const GetAudiobookShelfInput = z.object({
	bookUuid: z.string(),
});

export const RemoveAudiobookShelfInput = z.object({
	bookUuid: z.string(),
});

export const ListAudiobookShelfInput = z.object({
	status: z
		.enum([
			AUDIOBOOK_SHELF_STATUSES.WANT_TO_LISTEN,
			AUDIOBOOK_SHELF_STATUSES.BACKLOG,
			AUDIOBOOK_SHELF_STATUSES.LISTENING,
			AUDIOBOOK_SHELF_STATUSES.COMPLETED,
		])
		.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});
