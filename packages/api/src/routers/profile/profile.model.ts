import { z } from "zod";

export const UpdateProfileInput = z.object({
	bio: z.string().max(500).optional(),
});

export const GetActivityFeedInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
	})
	.optional();

export const GetStatsInput = z.void().optional();
