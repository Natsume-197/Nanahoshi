import { z } from "zod";

export const ToggleLikeInput = z.object({
	bookUuid: z.string(),
});

export const GetLikeStatusInput = z.object({
	bookUuid: z.string(),
});

export const LikedFormatInput = z.enum(["books", "audiobooks"]);

export const ListLikedInput = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
		cursor: z.number().int().min(0).optional(),
		sort: z.enum(["recent", "title", "author"]).default("recent").optional(),
		query: z.string().optional(),
		format: LikedFormatInput.default("books").optional(),
	})
	.optional();

export const CountLikedInput = z
	.object({
		format: LikedFormatInput.default("books").optional(),
	})
	.optional();
