import { z } from "zod";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { protectedProcedure } from "../../index";

export const authorsRouter = {
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
			const result = await provider.searchAuthors({
				query: input.query,
				organizationId,
				limit: input.limit ?? 5,
			});
			return result.authors;
		}),
};
