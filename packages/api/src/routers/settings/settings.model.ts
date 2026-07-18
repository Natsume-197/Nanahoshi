import { z } from "zod";

export const AmazonConfigSchema = z.object({
	domain: z.string().min(1),
	cookie: z.string().optional(),
	enabled: z.boolean(),
});

export const UpdateAmazonInput = AmazonConfigSchema.partial();

// Per-organization RanobeDB provider config.
export const UpdateRanobedbInput = z.object({
	enabled: z.boolean().optional(),
});

// Instance-global RanobeDB dump-import config (app-owner maintenance).
export const UpdateRanobedbDumpInput = z.object({
	autoUpdate: z.boolean().optional(),
});

export const UpdateRecommendationsInput = z.object({
	enabled: z.boolean(),
});

// Per-organization configs for the HTTP metadata providers. Empty-string
// keys clear the stored value (normalized in the router).
export const UpdateGoogleBooksInput = z.object({
	enabled: z.boolean().optional(),
	apiKey: z.string().max(128).optional(),
	langRestrict: z.string().max(8).optional(),
});

export const UpdateOpenLibraryInput = z.object({
	enabled: z.boolean().optional(),
});

export const UpdateGoodreadsInput = z.object({
	enabled: z.boolean().optional(),
});

export const UpdateComicvineInput = z.object({
	enabled: z.boolean().optional(),
	apiKey: z.string().max(128).optional(),
});

export const UpdateHardcoverInput = z.object({
	enabled: z.boolean().optional(),
	apiToken: z.string().max(2048).optional(),
});
