import { z } from "zod";

export const UpdateProfileInput = z.object({
	name: z.string().min(1).max(100).optional(),
	bio: z.string().max(2000).optional(),
	headerImage: z.string().optional(),
	// `null` clears the color (fall back to the default banner gradient).
	profileColor: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.nullish(),
});

export const UpdatePrivacyInput = z.object({
	shareReadingActivity: z.boolean(),
});

// Raw numeric id or a bookmeter.com profile URL; parsed server-side.
export const LinkBookmeterInput = z.object({
	bookmeter: z.string().min(1).max(200),
});

// Per-community override. `null` clears the override (fall back to global),
// `undefined` leaves it untouched.
export const UpdateOrgProfileInput = z.object({
	bio: z.string().max(2000).nullish(),
	headerImage: z.string().nullish(),
	image: z.string().nullish(),
});

export const GetPublicProfileInput = z.object({
	username: z.string().min(1),
});
