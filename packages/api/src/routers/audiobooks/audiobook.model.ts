import { z } from "zod";

export const GetAudiobookInput = z.object({
	uuid: z.string(),
});

export const ListAudiobooksInput = z.object({
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});
