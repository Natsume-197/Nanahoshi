import { protectedProcedure } from "../../index";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import {
	ListSeriesInput,
	SERIES_PAGE_SIZE,
	SearchSeriesInput,
} from "./series.model";
import { seriesRepository } from "./series.repository";

export const seriesRouter = {
	search: protectedProcedure
		.input(SearchSeriesInput)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!organizationId) return [];
			const provider = getSearchProvider();
			const result = await provider.searchSeries({
				query: input.query,
				organizationId,
				limit: input.limit ?? 5,
			});
			return result.series;
		}),
	list: protectedProcedure
		.input(ListSeriesInput)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!organizationId) return [];
			const limit = input?.limit ?? SERIES_PAGE_SIZE;
			const offset = input?.cursor ?? 0;

			// A search query routes through the full-text engine (relevance-ranked);
			// both paths return the same hit shape so pagination stays uniform.
			const query = input?.query?.trim();
			if (query) {
				const provider = getSearchProvider();
				const result = await provider.searchSeries({
					query,
					organizationId,
					limit,
					offset,
				});
				return result.series;
			}

			return seriesRepository.listWithBookCount(
				organizationId,
				limit,
				offset,
				input?.sort ?? "name",
			);
		}),
	count: protectedProcedure.handler(async ({ context }) => {
		const organizationId =
			context.session.session.activeOrganizationId ?? undefined;
		if (!organizationId) return 0;
		return seriesRepository.count(organizationId);
	}),
};
