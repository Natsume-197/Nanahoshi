import { z } from "zod";
import {
	canAccessBookAction,
	resolveBookScope,
} from "../../auth/access.repository";
import { ForbiddenError, NotFoundError } from "../../errors";
import { protectedProcedure } from "../../index";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import {
	groupAsEditions,
	ungroupEdition,
} from "../../modules/duplicateGrouping";
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
			const { organizationId, scope } = await resolveBookScope(context.session);
			return await bookService.getBookWithMetadata(
				input.uuid,
				organizationId,
				scope,
			);
		}),

	// Like getBookWithMetadata, but recovers the book's org when it's outside the
	// caller's active org (returns `switchedOrgId` so the client can switch).
	getBookResolvingOrg: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			return await bookService.getBookResolvingOrg(
				input.uuid,
				context.session.user.id,
				organizationId,
				scope,
				context.session.user.role === "admin",
			);
		}),

	listRecent: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(50).default(20) })
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			if (!organizationId) return [];
			return await bookService.getRecentBooks(
				input?.limit ?? 20,
				organizationId,
				scope,
			);
		}),

	listRandom: protectedProcedure
		.input(
			z
				.object({ limit: z.number().int().min(1).max(50).default(15) })
				.optional(),
		)
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			if (!organizationId) return [];
			return await bookService.getRandomBooks(
				input?.limit ?? 15,
				organizationId,
				scope,
			);
		}),

	search: protectedProcedure
		.input(searchInputSchema)
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			return await bookService.searchBooks({
				...input,
				organizationId,
				accessibleLibraryIds: scope,
			});
		}),

	reindex: protectedProcedure.handler(async () => {
		const job = await bookIndexQueue.add("reindex", {});
		return { jobId: job.id };
	}),

	enrichFromAmazon: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			if (
				!(await canAccessBookAction(
					context.session,
					input.uuid,
					"book",
					"editMetadata",
				))
			) {
				throw new ForbiddenError("You cannot edit this book's metadata");
			}
			const { organizationId, scope } = await resolveBookScope(context.session);
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				organizationId,
				scope,
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
			const { organizationId, scope } = await resolveBookScope(context.session);
			return bookRepository.listBySeriesName(
				input.seriesName,
				organizationId,
				scope,
			);
		}),

	listByGenre: protectedProcedure
		.input(z.object({ genreName: z.string() }))
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			return bookRepository.listByGenreName(
				input.genreName,
				organizationId,
				scope,
			);
		}),

	getOriginalMetadata: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			const { organizationId, scope } = await resolveBookScope(context.session);
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				organizationId,
				scope,
			);
			if (!book) throw new Error("Book not found");
			return bookMetadataRepository.getOriginalMetadata(book.id);
		}),

	restoreOriginalMetadata: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			if (
				!(await canAccessBookAction(
					context.session,
					input.uuid,
					"book",
					"editMetadata",
				))
			) {
				throw new ForbiddenError("You cannot edit this book's metadata");
			}
			const { organizationId, scope } = await resolveBookScope(context.session);
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				organizationId,
				scope,
			);
			if (!book) throw new Error("Book not found");
			const result = await bookMetadataService.restoreOriginal(book.id);
			return { success: result !== null };
		}),

	// Manually group two or more books as editions of the same logical book. The
	// largest file becomes the canonical (visible) entry; the rest are hidden but
	// remain downloadable from its detail page. Locked so a rescan won't undo it.
	groupAsEditions: protectedProcedure
		.input(z.object({ uuids: z.array(z.string()).min(2) }))
		.handler(async ({ input, context }) => {
			for (const uuid of input.uuids) {
				if (
					!(await canAccessBookAction(
						context.session,
						uuid,
						"book",
						"editMetadata",
					))
				) {
					throw new ForbiddenError("You cannot edit one of these books");
				}
			}
			const ids: number[] = [];
			for (const uuid of input.uuids) {
				const id = await bookRepository.getIdByUuid(uuid);
				if (id == null) throw new NotFoundError("Book not found");
				ids.push(id);
			}
			const result = await groupAsEditions(ids);
			return { success: result !== null };
		}),

	// Manually detach a book from its duplicate group (and lock it so automatic
	// grouping won't re-merge it).
	ungroupEdition: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input, context }) => {
			if (
				!(await canAccessBookAction(
					context.session,
					input.uuid,
					"book",
					"editMetadata",
				))
			) {
				throw new ForbiddenError("You cannot edit this book's metadata");
			}
			const id = await bookRepository.getIdByUuid(input.uuid);
			if (id == null) throw new NotFoundError("Book not found");
			await ungroupEdition(id);
			return { success: true };
		}),
};
