import { z } from "zod";

export const SERIES_PAGE_SIZE = 30;

export const SearchSeriesInput = z.object({
	query: z.string().min(1),
	limit: z.number().int().min(1).max(10).default(5).optional(),
});

export const RenameSeriesInput = z.object({
	id: z.number().int().positive(),
	name: z.string().min(1).max(512),
	description: z.string().nullable().optional(),
});

export const ListSeriesInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(SERIES_PAGE_SIZE).optional(),
		cursor: z.number().int().min(0).optional(),
		sort: z.enum(["name", "books", "recent"]).default("name").optional(),
		query: z.string().optional(),
	})
	.optional();
