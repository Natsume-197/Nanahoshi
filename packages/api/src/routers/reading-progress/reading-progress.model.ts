import type { readingProgress } from "@nanahoshi-v2/db/schema/general";
import { z } from "zod";

export type ReadingProgress = typeof readingProgress.$inferSelect;
export type CreateReadingProgress = typeof readingProgress.$inferInsert;

export const SaveProgressInput = z.object({
	bookUuid: z.string(),
	ttuBookId: z.number().int().optional(),
	exploredCharCount: z.number().int().optional(),
	bookCharCount: z.number().int().optional(),
	readingTimeSeconds: z.number().int().optional(),
	status: z.enum(["unread", "reading", "completed"]).optional(),
});

export const GetProgressInput = z.object({
	bookUuid: z.string(),
});

export const ListInProgressInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
	})
	.optional();
