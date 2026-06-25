import { resolveServerForCatalogEdit } from "../../auth/access.repository";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { protectedProcedure } from "../../index";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import { SearchAuthorsInput, UpdateAuthorInput } from "./author.model";
import { authorRepository } from "./author.repository";

export const authorsRouter = {
	search: protectedProcedure
		.input(SearchAuthorsInput)
		.handler(async ({ input, context }) => {
			const serverId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!serverId) return [];
			const provider = getSearchProvider();
			const result = await provider.searchAuthors({
				query: input.query,
				serverId,
				limit: input.limit ?? 5,
			});
			return result.authors;
		}),
	update: protectedProcedure
		.input(UpdateAuthorInput)
		.handler(async ({ input, context }) => {
			const serverId = await resolveServerForCatalogEdit(context.session);
			if (!serverId) {
				throw new ForbiddenError("You cannot edit this server's catalog");
			}
			const result = await authorRepository.rename(
				input.id,
				serverId,
				input.name,
				input.description,
			);
			if (result === "not_found") throw new NotFoundError("Author not found");
			if (result === "conflict") {
				throw new ConflictError("An author with that name already exists");
			}
			return { success: true };
		}),
};
