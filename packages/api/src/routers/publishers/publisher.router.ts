import { z } from "zod";
import { protectedProcedure } from "../../index";
import { publisherRepository } from "./publisher.repository";

const PUBLISHER_PAGE_SIZE = 30;

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
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!organizationId) return [];
			return publisherRepository.listWithBookCount(
				organizationId,
				input?.limit ?? PUBLISHER_PAGE_SIZE,
				input?.cursor ?? 0,
				input?.sort ?? "name",
				input?.query?.trim() || undefined,
			);
		}),
	count: protectedProcedure.handler(async ({ context }) => {
		const organizationId =
			context.session.session.activeOrganizationId ?? undefined;
		if (!organizationId) return 0;
		return publisherRepository.count(organizationId);
	}),
};
