import { z } from "zod";

export const ToggleLikeInput = z.object({
	bookUuid: z.string(),
});

export const GetLikeStatusInput = z.object({
	bookUuid: z.string(),
});

export const ListLikedInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
	})
	.optional();
