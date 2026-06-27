import {
	canAccessBookAction,
	resolveBookScope,
} from "../../auth/access.repository";
import { ForbiddenError, NotFoundError } from "../../errors";
import { orgProcedure, protectedProcedure } from "../../index";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import {
	groupAsEditions,
	ungroupEdition,
} from "../../modules/duplicateGrouping";
import {
	BookUuidInput,
	CountBooksByLibraryInput,
	GroupAsEditionsInput,
	ListBooksByGenreInput,
	ListBooksByLibraryInput,
	ListBooksByPublisherInput,
	ListBooksBySeriesInput,
	ListRandomBooksInput,
	ListRecentBooksInput,
	SearchBooksInput,
} from "./book.model";
import { bookRepository } from "./book.repository";
import * as bookService from "./book.service";
import { bookMetadataRepository } from "./metadata/metadata.repository";
import { bookMetadataService } from "./metadata/metadata.service";
import { buildEnrichInput } from "./metadata/metadata.utils";

export const bookRouter = {
	getBookWithMetadata: protectedProcedure
		.input(BookUuidInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return await bookService.getBookWithMetadata(input.uuid, serverId, scope);
		}),

	// Like getBookWithMetadata, but recovers the book's org when it's outside the
	// caller's active org (returns `switchedOrgId` so the client can switch).
	getBookResolvingOrg: protectedProcedure
		.input(BookUuidInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return await bookService.getBookResolvingOrg(
				input.uuid,
				context.session.user.id,
				serverId,
				scope,
				context.session.user.role === "admin",
			);
		}),

	listRecent: protectedProcedure
		.input(ListRecentBooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return await bookService.getRecentBooks(
				input?.limit ?? 20,
				serverId,
				scope,
			);
		}),

	listRandom: protectedProcedure
		.input(ListRandomBooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return await bookService.getRandomBooks(
				input?.limit ?? 15,
				serverId,
				scope,
			);
		}),

	search: protectedProcedure
		.input(SearchBooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			return await bookService.searchBooks({
				...input,
				serverId,
				accessibleLibraryIds: scope,
			});
		}),

	reindex: protectedProcedure.handler(async () => {
		const job = await bookIndexQueue.add("reindex", {});
		return { jobId: job.id };
	}),

	enrichFromAmazon: protectedProcedure
		.input(BookUuidInput)
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
			const { serverId, scope } = await resolveBookScope(context.session);
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				serverId,
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
		.input(ListBooksBySeriesInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listBySeriesName(input.seriesName, serverId, scope);
		}),

	listByGenre: protectedProcedure
		.input(ListBooksByGenreInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listByGenreName(input.genreName, serverId, scope);
		}),

	listByPublisher: protectedProcedure
		.input(ListBooksByPublisherInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listByPublisherName(
				input.publisherName,
				serverId,
				scope,
			);
		}),

	listByLibrary: protectedProcedure
		.input(ListBooksByLibraryInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listByLibraryId(input.libraryId, serverId, scope, {
				limit: input.limit,
				offset: input.cursor,
				sort: input.sort,
				query: input.query,
			});
		}),

	countByLibrary: protectedProcedure
		.input(CountBooksByLibraryInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return 0;
			return bookRepository.countByLibraryId(input.libraryId, serverId, scope);
		}),

	getOriginalMetadata: protectedProcedure
		.input(BookUuidInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				serverId,
				scope,
			);
			if (!book) throw new Error("Book not found");
			return bookMetadataRepository.getOriginalMetadata(book.id);
		}),

	restoreOriginalMetadata: protectedProcedure
		.input(BookUuidInput)
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
			const { serverId, scope } = await resolveBookScope(context.session);
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				serverId,
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
		.input(GroupAsEditionsInput)
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
	ungroupEdition: orgProcedure
		.input(BookUuidInput)
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
