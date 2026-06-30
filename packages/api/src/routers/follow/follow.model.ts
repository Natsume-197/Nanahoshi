import { z } from "zod";
import { MANUAL_PRESENCE_STATUSES } from "../../modules/presence/presence.types";

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

export const GetSuggestionsInput = z.object({
	limit: z.number().int().min(1).max(20).default(5),
});

export const GetFriendsInput = z.object({
	limit: z.number().int().min(1).max(100).default(50),
});

export const SetStatusInput = z.object({
	status: z.enum(MANUAL_PRESENCE_STATUSES),
});

export const SetIdleInput = z.object({
	idle: z.boolean(),
});
