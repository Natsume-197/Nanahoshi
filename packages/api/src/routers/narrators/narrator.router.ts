import { z } from "zod";
import { protectedProcedure } from "../../index";
import { narratorRepository } from "./narrator.repository";

const NARRATOR_PAGE_SIZE = 30;

export const narratorsRouter = {
	list: protectedProcedure
		.input(
			z
				.object({
					limit: z
						.number()
						.int()
						.min(1)
						.max(50)
						.default(NARRATOR_PAGE_SIZE)
						.optional(),
					cursor: z.number().int().min(0).optional(),
					sort: z.enum(["name", "books"]).default("name").optional(),
					query: z.string().optional(),
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const serverId =
				context.session.session.activeOrganizationId ?? undefined;
			return narratorRepository.listWithAudiobookCount(serverId, {
				limit: input?.limit ?? NARRATOR_PAGE_SIZE,
				offset: input?.cursor ?? 0,
				sort: input?.sort ?? "name",
				query: input?.query,
			});
		}),

	count: protectedProcedure.handler(async ({ context }) => {
		const serverId = context.session.session.activeOrganizationId ?? undefined;
		return narratorRepository.count(serverId);
	}),
};
