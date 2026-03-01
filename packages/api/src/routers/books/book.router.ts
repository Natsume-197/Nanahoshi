import { z } from "zod";
import { protectedProcedure } from "../../index";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import * as bookService from "./book.service";

export const bookRouter = {
	getBookWithMetadata: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input }) => {
			return await bookService.getBookWithMetadata(input.uuid);
		}),

	listRecent: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(50).default(20) })
				.optional(),
		)
		.handler(async ({ input, context }) => {
			return await bookService.getRecentBooks(
				input?.limit ?? 20,
				context.session.session.activeOrganizationId,
			);
		}),

	listRandom: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(50).default(15) })
				.optional(),
		)
		.handler(async ({ input, context }) => {
			return await bookService.getRandomBooks(
				input?.limit ?? 15,
				context.session.session.activeOrganizationId,
			);
		}),

	search: protectedProcedure
		.input(z.object({ query: z.string() }))
		.handler(async ({ input }) => {
			return await bookService.searchBooks(input.query);
		}),

	reindex: protectedProcedure.handler(async () => {
		const job = await bookIndexQueue.add("reindex", {});
		return { jobId: job.id };
	}),
};
