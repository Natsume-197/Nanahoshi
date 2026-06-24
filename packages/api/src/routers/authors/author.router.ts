import { protectedProcedure } from "../../index";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { SearchAuthorsInput } from "./author.model";

export const authorsRouter = {
	search: protectedProcedure
		.input(SearchAuthorsInput)
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
