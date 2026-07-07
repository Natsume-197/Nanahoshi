import { resolveBookScope } from "../../auth/access.repository";
import { protectedProcedure } from "../../index";
import {
	ApplyAudiobookMetadataInput,
	EnrichFromAudibleInput,
	GetAudiobookInput,
	GetAudioFileInput,
	ListAudiobookSeriesInput,
	ListAudiobooksBySeriesInput,
	ListAudiobooksInput,
	ListRandomAudiobooksInput,
	ListRecentAudiobooksInput,
	SearchAudibleInput,
	SearchAudiobookMetadataInput,
	SearchAudiobooksInput,
} from "./audiobook.model";
import * as audiobookService from "./audiobook.service";
import { audiobookMetadataService } from "./metadata/metadata.service";

function stripAudiobookId<T extends { id: unknown }>(audiobook: T) {
	const { id: _id, ...publicAudiobook } = audiobook;
	return publicAudiobook;
}

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
			const details = await audiobookService.getAudiobookDetails(
				input.uuid,
				serverId,
				scope,
			);
			return stripAudiobookId(details);
		}),

	list: protectedProcedure
		.input(ListAudiobooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return { items: [], total: 0 };
			const result = await audiobookService.listAudiobooks(
				serverId,
				input.limit,
				input.offset,
				scope,
			);
			return {
				...result,
				items: result.items.map(stripAudiobookId),
			};
		}),

	listRecent: protectedProcedure
		.input(ListRecentAudiobooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			const audiobooks = await audiobookService.listRecentAudiobooks(
				input?.limit ?? 20,
				serverId,
				scope,
			);
			return audiobooks.map(stripAudiobookId);
		}),

	listRandom: protectedProcedure
		.input(ListRandomAudiobooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			const audiobooks = await audiobookService.getRandomAudiobooks(
				input?.limit ?? 15,
				serverId,
				scope,
			);
			return audiobooks.map(stripAudiobookId);
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
				input.seriesUuid,
				serverId,
				scope,
			);
		}),

	listSeries: protectedProcedure
		.input(ListAudiobookSeriesInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			const rows = await audiobookService.listAudiobookSeries(
				serverId,
				{
					limit: input?.limit ?? 30,
					offset: input?.cursor ?? 0,
					sort: input?.sort ?? "name",
					query: input?.query,
				},
				scope,
			);
			return rows.map(({ id: _id, ...row }) => row);
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

	searchMetadata: protectedProcedure
		.input(SearchAudiobookMetadataInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			const details = await audiobookService.getAudiobookDetails(
				input.uuid,
				serverId,
				scope,
			);
			if (!details) return [];

			return audiobookMetadataService.searchProviderForBook(
				input.provider,
				details.id,
				{
					title: input.title,
					authors: input.author ? [{ name: input.author }] : undefined,
					asin: input.asin,
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

	applyMetadata: protectedProcedure
		.input(ApplyAudiobookMetadataInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			const details = await audiobookService.getAudiobookDetails(
				input.uuid,
				serverId,
				scope,
			);
			if (!details) return null;

			return audiobookMetadataService.enrichFromProvider(
				input.provider,
				{
					bookId: details.id,
					uuid: details.uuid,
					title: details.title ?? undefined,
					providerId: input.providerId,
					authors: details.authors?.map((a) => ({
						name: a.name,
					})),
				},
				input.region,
			);
		}),
};
