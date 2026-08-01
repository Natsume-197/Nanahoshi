import { z } from "zod";

export const UpdateProfileInput = z.object({
	name: z.string().min(1).max(100).optional(),
	headerImage: z.string().optional(),
});

export const UpdatePrivacyInput = z.object({
	shareReadingActivity: z.boolean(),
});

// Raw numeric id or a bookmeter.com profile URL; parsed server-side.
export const LinkBookmeterInput = z.object({
	bookmeter: z.string().min(1).max(200),
});

export const GetPublicProfileInput = z.object({
	username: z.string().min(1),
});
