import type { readingProgress } from "@nanahoshi-v2/db/schema/general";
import { z } from "zod";
import { READING_STATUSES } from "../../constants";

export type ReadingProgress = typeof readingProgress.$inferSelect;
export type CreateReadingProgress = typeof readingProgress.$inferInsert;

export const SaveProgressInput = z.object({
	bookUuid: z.string(),
	exploredCharCount: z.number().int().min(0).optional(),
	bookCharCount: z.number().int().min(0).optional(),
	positionIntentAt: z.number().int().min(0).optional(),
	syncOperationId: z.string().uuid().optional(),
	readingTimeSeconds: z.number().int().min(0).optional(),
	status: z
		.enum([
			READING_STATUSES.UNREAD,
			READING_STATUSES.READING,
			READING_STATUSES.COMPLETED,
		])
		.optional(),
});

export const GetProgressInput = z.object({
	bookUuid: z.string(),
});

export const ListInProgressInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
	})
	.optional();
