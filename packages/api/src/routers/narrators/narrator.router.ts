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
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			const limit = input?.limit ?? NARRATOR_PAGE_SIZE;
			const offset = input?.cursor ?? 0;
			return narratorRepository.listWithAudiobookCount(
				organizationId,
				limit,
				offset,
			);
		}),
};
