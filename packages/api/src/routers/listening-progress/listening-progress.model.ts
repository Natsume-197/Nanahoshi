import type { listeningProgress } from "@nanahoshi-v2/db/schema/general";
import { z } from "zod";
import { LISTENING_STATUSES } from "../../constants";

export type ListeningProgress = typeof listeningProgress.$inferSelect;
export type CreateListeningProgress = typeof listeningProgress.$inferInsert;

export const SaveListeningProgressInput = z.object({
	bookUuid: z.string(),
	currentTimeSeconds: z.number().min(0).optional(),
	durationSeconds: z.number().min(0).optional(),
	listeningTimeSeconds: z.number().int().min(0).optional(),
	status: z
		.enum([
			LISTENING_STATUSES.UNSTARTED,
			LISTENING_STATUSES.LISTENING,
			LISTENING_STATUSES.COMPLETED,
		])
		.optional(),
});

export const GetListeningProgressInput = z.object({
	bookUuid: z.string(),
});

export const ListListeningInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
	})
	.optional();
