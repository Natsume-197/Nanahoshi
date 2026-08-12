import { z } from "zod";
import { orgReadProcedure } from "../../index";
import { genreRepository } from "./genre.repository";

const GENRE_PAGE_SIZE = 30;

export const genresRouter = {
	list: orgReadProcedure
		.input(
			z
				.object({
					limit: z
						.number()
						.int()
						.min(1)
						.max(50)
						.default(GENRE_PAGE_SIZE)
						.optional(),
					cursor: z.number().int().min(0).optional(),
					sort: z.enum(["name", "books", "recent"]).default("name").optional(),
					query: z.string().optional(),
					mediaType: z.enum(["ebook", "audiobook", "all"]).optional(),
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const rows = await genreRepository.listWithBookCount(
				context.serverId,
				input?.limit ?? GENRE_PAGE_SIZE,
				input?.cursor ?? 0,
				input?.sort ?? "name",
				input?.query?.trim() || undefined,
				context.accessibleLibraryIds,
				input?.mediaType ?? "all",
			);
			return rows.map(({ id: _id, ...row }) => row);
		}),
	count: orgReadProcedure
		.input(
			z
				.object({
					mediaType: z.enum(["ebook", "audiobook", "all"]).optional(),
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			return genreRepository.count(
				context.serverId,
				context.accessibleLibraryIds,
				input?.mediaType ?? "all",
			);
		}),
	getByUuid: orgReadProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			return genreRepository.getByUuid(
				input.uuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),
};
