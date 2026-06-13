import { z } from "zod";
import { protectedProcedure } from "../../index";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { seriesRepository } from "./series.repository";

const SERIES_PAGE_SIZE = 30;

export const seriesRouter = {
	search: protectedProcedure
		.input(
			z.object({
				query: z.string().min(1),
				limit: z.number().int().min(1).max(10).default(5).optional(),
			}),
		)
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
		.input(
			z
				.object({
					limit: z
						.number()
						.int()
						.min(1)
						.max(50)
						.default(SERIES_PAGE_SIZE)
						.optional(),
					cursor: z.number().int().min(0).optional(),
					sort: z.enum(["name", "books", "recent"]).default("name").optional(),
					query: z.string().optional(),
				})
				.optional(),
		)
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
