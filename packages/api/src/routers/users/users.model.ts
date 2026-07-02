import { z } from "zod";

export const SearchUsersInput = z.object({
	query: z.string().trim().min(1),
	limit: z.number().int().min(1).max(10).optional(),
});
