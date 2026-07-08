import { z } from "zod";
import { orgReadProcedure } from "../../index";
import { narratorRepository } from "./narrator.repository";

const NARRATOR_PAGE_SIZE = 30;

export const narratorsRouter = {
	list: orgReadProcedure
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
			const rows = await narratorRepository.listWithAudiobookCount(
				context.serverId,
				{
					limit: input?.limit ?? NARRATOR_PAGE_SIZE,
					offset: input?.cursor ?? 0,
					sort: input?.sort ?? "name",
					query: input?.query,
				},
				context.accessibleLibraryIds,
			);
			return rows.map(({ id: _id, ...row }) => row);
		}),

	count: orgReadProcedure.handler(async ({ context }) => {
		return narratorRepository.count(
			context.serverId,
			context.accessibleLibraryIds,
		);
	}),

	getByUuid: orgReadProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			return narratorRepository.getByUuid(
				input.uuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),
};
