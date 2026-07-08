import { z } from "zod";
import { resolveServerForCatalogEdit } from "../../auth/access.repository";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { orgReadProcedure, protectedProcedure } from "../../index";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import {
	ListSeriesInput,
	RenameSeriesInput,
	SERIES_PAGE_SIZE,
	SearchSeriesInput,
} from "./series.model";
import { seriesRepository } from "./series.repository";

export const seriesRouter = {
	search: orgReadProcedure
		.input(SearchSeriesInput)
		.handler(async ({ input, context }) => {
			const provider = getSearchProvider();
			const result = await provider.searchSeries({
				query: input.query,
				serverId: context.serverId,
				limit: input.limit ?? 5,
			});
			const scoped = await Promise.all(
				result.series.map((hit) =>
					seriesRepository.getVisibleHitByUuid(
						hit.uuid,
						context.serverId,
						context.accessibleLibraryIds,
					),
				),
			);
			return scoped.filter(
				(hit): hit is NonNullable<typeof hit> => hit != null,
			);
		}),
	list: orgReadProcedure
		.input(ListSeriesInput)
		.handler(async ({ input, context }) => {
			const limit = input?.limit ?? SERIES_PAGE_SIZE;
			const offset = input?.cursor ?? 0;

			// A search query routes through the full-text engine (relevance-ranked);
			// both paths return the same hit shape so pagination stays uniform.
			const query = input?.query?.trim();
			if (query) {
				const provider = getSearchProvider();
				const result = await provider.searchSeries({
					query,
					serverId: context.serverId,
					limit,
					offset,
				});
				const scoped = await Promise.all(
					result.series.map((hit) =>
						seriesRepository.getVisibleHitByUuid(
							hit.uuid,
							context.serverId,
							context.accessibleLibraryIds,
						),
					),
				);
				return scoped.filter(
					(hit): hit is NonNullable<typeof hit> => hit != null,
				);
			}

			const rows = await seriesRepository.listWithBookCount(
				context.serverId,
				limit,
				offset,
				input?.sort ?? "name",
				context.accessibleLibraryIds,
			);
			return rows.map(({ id: _id, ...row }) => row);
		}),
	count: orgReadProcedure.handler(async ({ context }) => {
		return seriesRepository.count(
			context.serverId,
			context.accessibleLibraryIds,
		);
	}),
	getByUuid: orgReadProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			return seriesRepository.getByUuid(
				input.uuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),
	ratingStats: orgReadProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			return seriesRepository.getRatingStatsByUuid(
				input.uuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
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
