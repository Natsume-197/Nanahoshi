import { z } from "zod";
import { isManagedMediaUrl } from "../_shared/managed-media-url";

export const UpdateProfileInput = z.object({
	name: z.string().min(1).max(100).optional(),
	headerImage: z
		.string()
		.max(2048)
		.refine(isManagedMediaUrl, "Header image must be uploaded to this server")
		.optional(),
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
