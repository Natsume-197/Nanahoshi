import { z } from "zod";
import { protectedProcedure } from "../../index";
import { seriesRepository } from "./series.repository";

const SERIES_PAGE_SIZE = 30;

export const seriesRouter = {
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
			return seriesRepository.listWithBookCount(
				organizationId,
				limit,
				offset,
			);
		}),
};
