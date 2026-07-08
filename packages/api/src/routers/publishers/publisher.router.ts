import { z } from "zod";
import { resolveServerForCatalogEdit } from "../../auth/access.repository";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { orgReadProcedure, protectedProcedure } from "../../index";
import { publisherRepository } from "./publisher.repository";

const PUBLISHER_PAGE_SIZE = 30;

const UpdatePublisherInput = z.object({
	uuid: z.string().uuid(),
	name: z.string().min(1).max(512),
});

export const publishersRouter = {
	list: orgReadProcedure
		.input(
			z
				.object({
					limit: z
						.number()
						.int()
						.min(1)
						.max(50)
						.default(PUBLISHER_PAGE_SIZE)
						.optional(),
					cursor: z.number().int().min(0).optional(),
					sort: z.enum(["name", "books", "recent"]).default("name").optional(),
					query: z.string().optional(),
				})
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const rows = await publisherRepository.listWithBookCount(
				context.serverId,
				input?.limit ?? PUBLISHER_PAGE_SIZE,
				input?.cursor ?? 0,
				input?.sort ?? "name",
				input?.query?.trim() || undefined,
				context.accessibleLibraryIds,
			);
			return rows.map(({ id: _id, ...row }) => row);
		}),
	count: orgReadProcedure.handler(async ({ context }) => {
		return publisherRepository.count(
			context.serverId,
			context.accessibleLibraryIds,
		);
	}),
	getByUuid: orgReadProcedure
		.input(z.object({ uuid: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			return publisherRepository.getByUuid(
				input.uuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),
	update: protectedProcedure
		.input(UpdatePublisherInput)
		.handler(async ({ input, context }) => {
			const serverId = await resolveServerForCatalogEdit(context.session);
			if (!serverId) {
				throw new ForbiddenError("You cannot edit this server's catalog");
			}
			const result = await publisherRepository.rename(
				input.uuid,
				serverId,
				input.name,
			);
			if (result === "not_found")
				throw new NotFoundError("Publisher not found");
			if (result === "conflict") {
				throw new ConflictError("A publisher with that name already exists");
			}
			return { success: true };
		}),
};
