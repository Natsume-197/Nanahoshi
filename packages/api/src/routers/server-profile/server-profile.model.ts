import { z } from "zod";

export const UpdateServerProfileInput = z
	.object({
		name: z.string().trim().min(1).max(100).optional(),
		// `null` clears the image and falls back to the generated badge / theme.
		logo: z.string().url().nullable().optional(),
		background: z.string().url().nullable().optional(),
	})
	.refine((v) => Object.keys(v).length > 0, {
		message: "No fields to update",
	});

export type UpdateServerProfileInput = z.infer<typeof UpdateServerProfileInput>;
