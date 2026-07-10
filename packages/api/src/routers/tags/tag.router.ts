import { z } from "zod";
import { orgReadProcedure } from "../../index";
import { tagRepository } from "./tag.repository";

const TAG_PAGE_SIZE = 30;

export const tagsRouter = {
	list: orgReadProcedure
		.input(
			z
				.object({
					limit: z
						.number()
						.int()
						.min(1)
						.max(50)
						.default(TAG_PAGE_SIZE)
						.optional(),
					cursor: z.number().int().min(0).optional(),
					sort: z.enum(["name", "books", "recent"]).default("name").optional(),
					query: z.string().optional(),
					mediaType: z.enum(["ebook", "audiobook"]).optional(),
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const rows = await tagRepository.listWithBookCount(
				context.serverId,
				input?.limit ?? TAG_PAGE_SIZE,
				input?.cursor ?? 0,
				input?.sort ?? "name",
				input?.query?.trim() || undefined,
				context.accessibleLibraryIds,
				input?.mediaType ?? "ebook",
			);
			return rows.map(({ id: _id, ...row }) => row);
		}),
	count: orgReadProcedure
		.input(
			z
				.object({ mediaType: z.enum(["ebook", "audiobook"]).optional() })
				.optional(),
		)
		.handler(async ({ input, context }) => {
			return tagRepository.count(
				context.serverId,
				context.accessibleLibraryIds,
				input?.mediaType ?? "ebook",
			);
		}),
	getByUuid: orgReadProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			return tagRepository.getByUuid(
				input.uuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),
};
