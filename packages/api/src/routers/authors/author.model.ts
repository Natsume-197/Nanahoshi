import { z } from "zod";

export const SearchAuthorsInput = z.object({
	query: z.string().min(1),
	limit: z.number().int().min(1).max(10).default(5).optional(),
});

export const UpdateAuthorInput = z.object({
	id: z.number().int().positive(),
	name: z.string().min(1).max(512),
	description: z.string().nullable().optional(),
});
