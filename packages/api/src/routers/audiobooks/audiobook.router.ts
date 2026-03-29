import { z } from "zod";
import { protectedProcedure } from "../../index";
import { GetAudiobookInput, ListAudiobooksInput } from "./audiobook.model";
import * as audiobookService from "./audiobook.service";
import { audiobookMetadataService } from "./metadata/metadata.service";

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
		authorIds: z.array(z.number().int().nonnegative()).optional(),
		narrators: z.array(z.string()).optional(),
		narratorIds: z.array(z.number().int().nonnegative()).optional(),
		series: z.array(z.string()).optional(),
	})
	.optional();

const searchAudiobookInputSchema = z.object({
	query: z.string().optional(),
	exactMatch: z.boolean().optional(),
	filters: searchAudiobookFiltersSchema,
	sort: z
		.enum(["relevance", "newest", "oldest", "title_asc", "title_desc"])
		.optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(50).default(20).optional(),
});

export const audiobooksRouter = {
	search: protectedProcedure
		.input(searchAudiobookInputSchema)
		.handler(async ({ input, context }) => {
			return await audiobookService.searchAudiobooks({
				...input,
				organizationId:
					context.session.session.activeOrganizationId ?? undefined,
			});
		}),

	getDetails: protectedProcedure
		.input(GetAudiobookInput)
		.handler(async ({ input, context }) => {
			return audiobookService.getAudiobookDetails(
				input.uuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	list: protectedProcedure
		.input(ListAudiobooksInput)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!organizationId) return { items: [], total: 0 };
			return audiobookService.listAudiobooks(
				organizationId,
				input.limit,
				input.offset,
			);
		}),

	listRecent: protectedProcedure
		.input(
			z
				.object({
					limit: z.number().int().min(1).max(50).default(20),
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			return audiobookService.listRecentAudiobooks(
				input?.limit ?? 20,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	getAudioFile: protectedProcedure
		.input(
			z.object({
				uuid: z.string(),
				fileIndex: z.number().int().min(0),
			}),
		)
		.handler(async ({ input, context }) => {
			return audiobookService.getAudioFile(
				input.uuid,
				input.fileIndex,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	listBySeries: protectedProcedure
		.input(z.object({ seriesName: z.string() }))
		.handler(async ({ input, context }) => {
			return audiobookService.listAudiobooksBySeries(
				input.seriesName,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	listSeries: protectedProcedure
		.input(
			z
				.object({
					limit: z.number().int().min(1).max(50).default(30).optional(),
					cursor: z.number().int().min(0).optional(),
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			const limit = input?.limit ?? 30;
			const offset = input?.cursor ?? 0;
			return audiobookService.listAudiobookSeries(
				organizationId,
				limit,
				offset,
			);
		}),

	searchAudible: protectedProcedure
		.input(
			z.object({
				title: z.string().optional(),
				author: z.string().optional(),
				region: z.string().default("us"),
			}),
		)
		.handler(async ({ input }) => {
			return audiobookMetadataService.searchAudible(
				{
					title: input.title,
					authors: input.author ? [{ name: input.author }] : undefined,
				},
				input.region,
			);
		}),

	enrichFromAudible: protectedProcedure
		.input(
			z.object({
				uuid: z.string(),
				asin: z.string(),
				region: z.string().default("us"),
			}),
		)
		.handler(async ({ input, context }) => {
			const details = await audiobookService.getAudiobookDetails(
				input.uuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
			if (!details) return null;

			return audiobookMetadataService.enrichFromAudible(
				{
					bookId: details.id,
					uuid: details.uuid,
					title: details.title ?? undefined,
					asin: input.asin,
					authors: details.authors?.map((a) => ({
						name: a.name,
					})),
				},
				input.region,
			);
		}),
};
