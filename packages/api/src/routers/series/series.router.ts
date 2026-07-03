import { z } from "zod";
import { resolveServerForCatalogEdit } from "../../auth/access.repository";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { protectedProcedure } from "../../index";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import {
	ListSeriesInput,
	RenameSeriesInput,
	SERIES_PAGE_SIZE,
	SearchSeriesInput,
} from "./series.model";
import { seriesRepository } from "./series.repository";

export const seriesRouter = {
	search: protectedProcedure
		.input(SearchSeriesInput)
		.handler(async ({ input, context }) => {
			const serverId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!serverId) return [];
			const provider = getSearchProvider();
			const result = await provider.searchSeries({
				query: input.query,
				serverId,
				limit: input.limit ?? 5,
			});
			return result.series;
		}),
	list: protectedProcedure
		.input(ListSeriesInput)
		.handler(async ({ input, context }) => {
			const serverId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!serverId) return [];
			const limit = input?.limit ?? SERIES_PAGE_SIZE;
			const offset = input?.cursor ?? 0;

			// A search query routes through the full-text engine (relevance-ranked);
			// both paths return the same hit shape so pagination stays uniform.
			const query = input?.query?.trim();
			if (query) {
				const provider = getSearchProvider();
				const result = await provider.searchSeries({
					query,
					serverId,
					limit,
					offset,
				});
				return result.series;
			}

			const rows = await seriesRepository.listWithBookCount(
				serverId,
				limit,
				offset,
				input?.sort ?? "name",
			);
			return rows.map(({ id: _id, ...row }) => row);
		}),
	count: protectedProcedure.handler(async ({ context }) => {
		const serverId = context.session.session.activeOrganizationId ?? undefined;
		if (!serverId) return 0;
		return seriesRepository.count(serverId);
	}),
	getByUuid: protectedProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			const serverId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!serverId) return null;
			return seriesRepository.getByUuid(input.uuid, serverId);
		}),
	ratingStats: protectedProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			const serverId =
				context.session.session.activeOrganizationId ?? undefined;
			return seriesRepository.getRatingStatsByUuid(input.uuid, serverId);
		}),
	rename: protectedProcedure
		.input(RenameSeriesInput)
		.handler(async ({ input, context }) => {
			const serverId = await resolveServerForCatalogEdit(context.session);
			if (!serverId) {
				throw new ForbiddenError("You cannot edit this server's catalog");
			}
			const result = await seriesRepository.rename(
				input.uuid,
				serverId,
				input.name,
				input.description,
			);
			if (result === "not_found") throw new NotFoundError("Series not found");
			if (result === "conflict") {
				throw new ConflictError("A series with that name already exists");
			}
			return { success: true };
		}),
};
