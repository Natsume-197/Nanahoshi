import { z } from "zod";
import { resolveServerForCatalogEdit } from "../../auth/access.repository";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { orgReadProcedure, protectedProcedure } from "../../index";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import {
	AuthorRatingStatsInput,
	ListAuthorsInput,
	SearchAuthorsInput,
	UpdateAuthorInput,
} from "./author.model";
import { authorRepository } from "./author.repository";
import * as authorService from "./author.service";

const AUTHOR_PAGE_SIZE = 30;

export const authorsRouter = {
	list: orgReadProcedure
		.input(ListAuthorsInput)
		.handler(async ({ input, context }) => {
			const rows = await authorRepository.listWithBookCount(
				context.serverId,
				{
					limit: input?.limit ?? AUTHOR_PAGE_SIZE,
					offset: input?.cursor ?? 0,
					sort: input?.sort ?? "name",
					query: input?.query,
				},
				context.accessibleLibraryIds,
			);
			return rows.map(({ id: _id, ...row }) => row);
		}),

	count: orgReadProcedure.handler(async ({ context }) => {
		return authorRepository.count(
			context.serverId,
			context.accessibleLibraryIds,
		);
	}),

	getByUuid: orgReadProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			return authorRepository.getByUuid(
				input.uuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	ratingStats: orgReadProcedure
		.input(AuthorRatingStatsInput)
		.handler(async ({ input, context }) => {
			return authorRepository.getRatingStatsByUuid(
				input.uuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	search: orgReadProcedure
		.input(SearchAuthorsInput)
		.handler(async ({ input, context }) => {
			const provider = getSearchProvider();
			const result = await provider.searchAuthors({
				query: input.query,
				serverId: context.serverId,
				accessibleLibraryIds: context.accessibleLibraryIds,
				limit: input.limit ?? 5,
			});
			const scoped = await Promise.all(
				result.authors.map((hit) =>
					authorRepository.getVisibleHitByUuid(
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
	update: protectedProcedure
		.input(UpdateAuthorInput)
		.handler(async ({ input, context }) => {
			const serverId = await resolveServerForCatalogEdit(context.session);
			if (!serverId) {
				throw new ForbiddenError("You cannot edit this server's catalog");
			}
			const result = await authorService.updateAuthor({
				uuid: input.uuid,
				serverId,
				name: input.name,
				description: input.description,
			});
			if (result === "not_found") throw new NotFoundError("Author not found");
			if (result === "conflict") {
				throw new ConflictError("An author with that name already exists");
			}
			return { success: true };
		}),
};
