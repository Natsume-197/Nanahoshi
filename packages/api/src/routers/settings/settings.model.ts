import { z } from "zod";

export const AmazonConfigSchema = z.object({
	domain: z.string().min(1),
	cookie: z.string().optional(),
	enabled: z.boolean(),
});

export const UpdateAmazonInput = AmazonConfigSchema.partial();

export const UpdateRanobedbInput = z.object({
	enabled: z.boolean().optional(),
	autoUpdate: z.boolean().optional(),
});
