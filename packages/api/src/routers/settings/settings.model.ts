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
