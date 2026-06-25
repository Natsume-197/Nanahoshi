import { z } from "zod";
import { resolveServerForCatalogEdit } from "../../auth/access.repository";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { protectedProcedure } from "../../index";
import { publisherRepository } from "./publisher.repository";

const PUBLISHER_PAGE_SIZE = 30;

const UpdatePublisherInput = z.object({
	id: z.number().int().positive(),
	name: z.string().min(1).max(512),
});

export const publishersRouter = {
	list: protectedProcedure
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
			const serverId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!serverId) return [];
			return publisherRepository.listWithBookCount(
				serverId,
				input?.limit ?? PUBLISHER_PAGE_SIZE,
				input?.cursor ?? 0,
				input?.sort ?? "name",
				input?.query?.trim() || undefined,
			);
		}),
	count: protectedProcedure.handler(async ({ context }) => {
		const serverId = context.session.session.activeOrganizationId ?? undefined;
		if (!serverId) return 0;
		return publisherRepository.count(serverId);
	}),
	update: protectedProcedure
		.input(UpdatePublisherInput)
		.handler(async ({ input, context }) => {
			const serverId = await resolveServerForCatalogEdit(context.session);
			if (!serverId) {
				throw new ForbiddenError("You cannot edit this server's catalog");
			}
			const result = await publisherRepository.rename(
				input.id,
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
