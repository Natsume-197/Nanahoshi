import { z } from "zod";

export const RecommendationFormatInput = z.enum(["all", "books", "audiobooks"]);

export const ForUserInput = z
	.object({
		format: RecommendationFormatInput.default("all").optional(),
		perMixLimit: z.number().int().min(1).max(20).default(15).optional(),
	})
	.optional();

export const PopularInput = z
	.object({
		format: RecommendationFormatInput.default("all").optional(),
		limit: z.number().int().min(1).max(20).default(15).optional(),
	})
	.optional();

export const SimilarToBookInput = z.object({
	bookUuid: z.string(),
	format: RecommendationFormatInput.default("all").optional(),
	limit: z.number().int().min(1).max(30).default(12).optional(),
});

export const SimilarToSeriesInput = z.object({
	seriesUuid: z.string(),
	format: RecommendationFormatInput.default("all").optional(),
	limit: z.number().int().min(1).max(30).default(12).optional(),
});

export const ContinueSeriesInput = z
	.object({
		format: RecommendationFormatInput.default("all").optional(),
		limit: z.number().int().min(1).max(30).default(15).optional(),
	})
	.optional();

// exactly one of bookUuid / seriesUuid identifies the work
export const NotInterestedInput = z
	.object({
		bookUuid: z.string().optional(),
		seriesUuid: z.string().optional(),
	})
	.refine((v) => Boolean(v.bookUuid) !== Boolean(v.seriesUuid), {
		message: "Provide exactly one of bookUuid or seriesUuid",
	});

export type RecommendationFormat = z.infer<typeof RecommendationFormatInput>;

export interface RecommendationBook {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	/** Cover's dominant color (hex); tints the loading placeholder. */
	mainColor: string | null;
	authors: { uuid: string; name: string }[];
	mediaType: "ebook" | "audiobook";
}

export interface RecommendationItem {
	kind: "series" | "book";
	seriesUuid: string | null;
	seriesName: string | null;
	book: RecommendationBook;
	reason: {
		type:
			| "because_you_liked"
			| "same_author"
			| "shared_genres"
			| "similar_content"
			| "same_publisher"
			| "readers_also_liked"
			| "popular"
			| "recommended";
		refTitle: string | null;
	};
	score: number;
}

/** Next unread volume of a series the user finished the latest volume of. */
export interface ContinueSeriesItem {
	seriesUuid: string;
	seriesName: string;
	nextPosition: number | null;
	book: RecommendationBook;
}

export interface MixRow {
	mixIndex: number;
	anchorTitle: string | null;
	items: RecommendationItem[];
}

export interface ForUserOutput {
	enabled: boolean;
	mixes: MixRow[];
}
