import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import {
	EnrichFromAudibleInput,
	GetAudiobookInput,
	GetAudioFileInput,
	ListAudiobookSeriesInput,
	ListAudiobooksBySeriesInput,
	ListAudiobooksInput,
	ListRecentAudiobooksInput,
	SearchAudibleInput,
	SearchAudiobooksInput,
} from "./audiobook.model";
import * as audiobookService from "./audiobook.service";
import { audiobookMetadataService } from "./metadata/metadata.service";

export const audiobooksRouter = {
	search: protectedProcedure
		.input(SearchAudiobooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return await audiobookService.searchAudiobooks({
				...input,
				serverId,
				accessibleLibraryIds: scope,
			});
		}),

	getDetails: protectedProcedure
		.input(GetAudiobookInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return audiobookService.getAudiobookDetails(input.uuid, serverId, scope);
		}),

	list: protectedProcedure
		.input(ListAudiobooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return { items: [], total: 0 };
			return audiobookService.listAudiobooks(
				serverId,
				input.limit,
				input.offset,
				scope,
			);
		}),

	listRecent: protectedProcedure
		.input(ListRecentAudiobooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return audiobookService.listRecentAudiobooks(
				input?.limit ?? 20,
				serverId,
				scope,
			);
		}),

	getAudioFile: protectedProcedure
		.input(GetAudioFileInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return audiobookService.getAudioFile(
				input.uuid,
				input.fileIndex,
				serverId,
				scope,
			);
		}),

	listBySeries: protectedProcedure
		.input(ListAudiobooksBySeriesInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return audiobookService.listAudiobooksBySeries(
				input.seriesName,
				serverId,
				scope,
			);
		}),

	listSeries: protectedProcedure
		.input(ListAudiobookSeriesInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return audiobookService.listAudiobookSeries(
				serverId,
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
		const { serverId, scope } = await resolveBookScope(context.session);
		if (!serverId) return 0;
		return audiobookService.countAudiobookSeries(serverId, scope);
	}),

	searchAudible: protectedProcedure
		.input(SearchAudibleInput)
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
		.input(EnrichFromAudibleInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			const details = await audiobookService.getAudiobookDetails(
				input.uuid,
				serverId,
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
