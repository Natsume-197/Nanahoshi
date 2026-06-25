import { z } from "zod";
import { protectedProcedure } from "../../index";
import { genreRepository } from "./genre.repository";

const GENRE_PAGE_SIZE = 30;

export const genresRouter = {
	list: protectedProcedure
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
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const serverId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!serverId) return [];
			return genreRepository.listWithBookCount(
				serverId,
				input?.limit ?? GENRE_PAGE_SIZE,
				input?.cursor ?? 0,
				input?.sort ?? "name",
				input?.query?.trim() || undefined,
			);
		}),
	count: protectedProcedure.handler(async ({ context }) => {
		const serverId = context.session.session.activeOrganizationId ?? undefined;
		if (!serverId) return 0;
		return genreRepository.count(serverId);
	}),
};
