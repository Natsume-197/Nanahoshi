import { z } from "zod";

export const UpdateProfileInput = z.object({
	name: z.string().min(1).max(100).optional(),
	bio: z.string().max(500).optional(),
});

export const GetActivityFeedInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
	})
	.optional();

export const GetPublicProfileInput = z.object({
	username: z.string().min(1),
});

export const GetPublicActivityFeedInput = z.object({
	username: z.string().min(1),
	limit: z.number().int().min(1).max(50).default(20),
});

export const GetSocialFeedInput = z.object({
	type: z.enum(["global", "following"]),
	limit: z.number().int().min(1).max(50).default(20),
	cursor: z.number().optional(),
});

export const ActivityInteractionInput = z.object({
	activityId: z.number().int().positive(),
});

export const AddCommentInput = z.object({
	activityId: z.number().int().positive(),
	content: z.string().min(1).max(500),
});

export const DeleteCommentInput = z.object({
	commentId: z.number().int().positive(),
});

export const GetCommentsInput = z.object({
	activityId: z.number().int().positive(),
	limit: z.number().int().min(1).max(50).default(20),
});
