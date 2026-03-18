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
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			const limit = input?.limit ?? SERIES_PAGE_SIZE;
			const offset = input?.cursor ?? 0;
			return seriesRepository.listWithBookCount(organizationId, limit, offset);
		}),
};
