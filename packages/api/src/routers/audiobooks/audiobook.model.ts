import { z } from "zod";

export const GetAudiobookInput = z.object({
	uuid: z.string(),
});

export const ListAudiobooksInput = z.object({
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

const searchAudiobookFiltersSchema = z
	.object({
		languageCode: z.array(z.string()).optional(),
		publishedDateRange: z
			.object({
				from: z.string().optional(),
				to: z.string().optional(),
			})
			.optional(),
		authors: z.array(z.string()).optional(),
		authorUuids: z.array(z.string().uuid()).optional(),
		narrators: z.array(z.string()).optional(),
		narratorUuids: z.array(z.string().uuid()).optional(),
		series: z.array(z.string()).optional(),
	})
	.optional();

export const SearchAudiobooksInput = z.object({
	query: z.string().optional(),
	exactMatch: z.boolean().optional(),
	filters: searchAudiobookFiltersSchema,
	sort: z
		.enum(["relevance", "newest", "oldest", "title_asc", "title_desc"])
		.optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(50).default(20).optional(),
});

export const ListRecentAudiobooksInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
	})
	.optional();

export const GetAudioFileInput = z.object({
	uuid: z.string(),
	fileIndex: z.number().int().min(0),
});

export const ListAudiobooksBySeriesInput = z.object({
	seriesUuid: z.string().uuid(),
});

export const ListAudiobookSeriesInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(30).optional(),
		cursor: z.number().int().min(0).optional(),
		sort: z.enum(["name", "books", "recent"]).default("name").optional(),
		query: z.string().optional(),
	})
	.optional();

export const SearchAudibleInput = z.object({
	title: z.string().optional(),
	author: z.string().optional(),
	region: z.string().default("us"),
});

export const EnrichFromAudibleInput = z.object({
	uuid: z.string(),
	asin: z.string(),
	region: z.string().default("us"),
});
