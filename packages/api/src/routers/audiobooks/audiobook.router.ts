import { z } from "zod";
import { resolveBookScope } from "../../auth/access.repository";
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
			const { organizationId, scope } = await resolveBookScope(context.session);
			return await audiobookService.searchAudiobooks({
				...input,
				organizationId,
				accessibleLibraryIds: scope,
			});
		}),

	getDetails: protectedProcedure
		.input(GetAudiobookInput)
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			return audiobookService.getAudiobookDetails(
				input.uuid,
				organizationId,
				scope,
			);
		}),

	list: protectedProcedure
		.input(ListAudiobooksInput)
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			if (!organizationId) return { items: [], total: 0 };
			return audiobookService.listAudiobooks(
				organizationId,
				input.limit,
				input.offset,
				scope,
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
			const { organizationId, scope } = await resolveBookScope(context.session);
			return audiobookService.listRecentAudiobooks(
				input?.limit ?? 20,
				organizationId,
				scope,
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
			const { organizationId, scope } = await resolveBookScope(context.session);
			return audiobookService.getAudioFile(
				input.uuid,
				input.fileIndex,
				organizationId,
				scope,
			);
		}),

	listBySeries: protectedProcedure
		.input(z.object({ seriesName: z.string() }))
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			return audiobookService.listAudiobooksBySeries(
				input.seriesName,
				organizationId,
				scope,
			);
		}),

	listSeries: protectedProcedure
		.input(
			z
				.object({
					limit: z.number().int().min(1).max(50).default(30).optional(),
					cursor: z.number().int().min(0).optional(),
					sort: z.enum(["name", "books", "recent"]).default("name").optional(),
					query: z.string().optional(),
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			return audiobookService.listAudiobookSeries(
				organizationId,
				{
					limit: input?.limit ?? 30,
					offset: input?.cursor ?? 0,
					sort: input?.sort ?? "name",
					query: input?.query,
				},
				scope,
			);
		}),

	countSeries: protectedProcedure.handler(async ({ context }) => {
		const { organizationId, scope } = await resolveBookScope(context.session);
		return audiobookService.countAudiobookSeries(organizationId, scope);
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
			const { organizationId, scope } = await resolveBookScope(context.session);
			const details = await audiobookService.getAudiobookDetails(
				input.uuid,
				organizationId,
				scope,
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
