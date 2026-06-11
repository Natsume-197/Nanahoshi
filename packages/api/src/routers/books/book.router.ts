import { z } from "zod";
import { protectedProcedure } from "../../index";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import { bookRepository } from "./book.repository";
import * as bookService from "./book.service";
import { bookMetadataRepository } from "./metadata/metadata.repository";
import { bookMetadataService } from "./metadata/metadata.service";
import { buildEnrichInput } from "./metadata/metadata.utils";

const searchFiltersSchema = z
	.object({
		languageCode: z.array(z.string()).optional(),
		publishedDateRange: z
			.object({
				from: z.string().optional(),
				to: z.string().optional(),
			})
			.optional(),
		pageCountRange: z
			.object({
				min: z.number().int().optional(),
				max: z.number().int().optional(),
			})
			.optional(),
		authors: z.array(z.string()).optional(),
		authorIds: z.array(z.number().int().nonnegative()).optional(),
		series: z.array(z.string()).optional(),
		publishers: z.array(z.string()).optional(),
	})
	.optional();

const searchInputSchema = z.object({
	query: z.string().optional(),
	exactMatch: z.boolean().optional(),
	filters: searchFiltersSchema,
	sort: z
		.enum(["relevance", "newest", "oldest", "title_asc", "title_desc"])
		.optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(50).default(20).optional(),
});

export const bookRouter = {
	getBookWithMetadata: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			return await bookService.getBookWithMetadata(
				input.uuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	// Like getBookWithMetadata, but recovers the book's org when it's outside the
	// caller's active org (returns `switchedOrgId` so the client can switch).
	getBookResolvingOrg: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			return await bookService.getBookResolvingOrg(
				input.uuid,
				context.session.user.id,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	listRecent: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(50).default(20) })
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!organizationId) return [];
			return await bookService.getRecentBooks(
				input?.limit ?? 20,
				organizationId,
			);
		}),

	listRandom: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(50).default(15) })
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const organizationId =
				context.session.session.activeOrganizationId ?? undefined;
			if (!organizationId) return [];
			return await bookService.getRandomBooks(
				input?.limit ?? 15,
				organizationId,
			);
		}),

	search: protectedProcedure
		.input(searchInputSchema)
		.handler(async ({ input, context }) => {
			return await bookService.searchBooks({
				...input,
				organizationId:
					context.session.session.activeOrganizationId ?? undefined,
			});
		}),

	reindex: protectedProcedure.handler(async () => {
		const job = await bookIndexQueue.add("reindex", {});
		return { jobId: job.id };
	}),

	enrichFromAmazon: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
			if (!book) {
				throw new Error("Book not found");
			}

			const enrichInput = buildEnrichInput(book.id, book.uuid, book);
			const result = await bookMetadataService.enrichFromAmazon(enrichInput);

			return { success: result !== null };
		}),

	listBySeries: protectedProcedure
		.input(z.object({ seriesName: z.string() }))
		.handler(async ({ input, context }) => {
			return bookRepository.listBySeriesName(
				input.seriesName,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	getOriginalMetadata: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
			if (!book) throw new Error("Book not found");
			return bookMetadataRepository.getOriginalMetadata(book.id);
		}),

	restoreOriginalMetadata: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
			if (!book) throw new Error("Book not found");
			const result = await bookMetadataService.restoreOriginal(book.id);
			return { success: result !== null };
		}),
};
