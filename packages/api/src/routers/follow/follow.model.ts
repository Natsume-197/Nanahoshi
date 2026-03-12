import { z } from "zod";

export const FollowInput = z.object({
	username: z.string().min(1),
});

export const GetFollowersInput = z.object({
	username: z.string().min(1),
	limit: z.number().int().min(1).max(50).default(20),
	cursor: z.number().optional(),
});

export const GetFollowingInput = z.object({
	username: z.string().min(1),
	limit: z.number().int().min(1).max(50).default(20),
	cursor: z.number().optional(),
});
