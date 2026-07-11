import {
	canAccessBookAction,
	resolveBookScope,
} from "../../auth/access.repository";
import { ForbiddenError, NotFoundError } from "../../errors";
import { adminProcedure, orgProcedure, protectedProcedure } from "../../index";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import {
	groupAsEditions,
	ungroupEdition,
} from "../../modules/duplicateGrouping";
import { libraryRepository } from "../libraries/library.repository";
import {
	BookUuidInput,
	CountAllBooksInput,
	CountBooksByLibraryInput,
	GroupAsEditionsInput,
	LibraryFacetsInput,
	ListAllBooksInput,
	ListBooksByGenreInput,
	ListBooksByLibraryInput,
	ListBooksByPublisherInput,
	ListBooksBySeriesInput,
	ListBooksByTagInput,
	ListRandomBooksInput,
	ListRecentBooksInput,
	SearchBooksInput,
} from "./book.model";
import { bookRepository } from "./book.repository";
import * as bookService from "./book.service";
import {
	ApplyBookMetadataInput,
	SearchBookMetadataInput,
	UpdateBookMetadataInput,
} from "./metadata/book.metadata.model";
import { bookMetadataRepository } from "./metadata/metadata.repository";
import { bookMetadataService } from "./metadata/metadata.service";
import { buildEnrichInput } from "./metadata/metadata.utils";

function stripBookId<T extends { id: unknown }>(book: T) {
	const { id: _id, ...publicBook } = book;
	return publicBook;
}

export const bookRouter = {
	getBookWithMetadata: protectedProcedure
		.input(BookUuidInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				serverId,
				scope,
			);
			return stripBookId(book);
		}),

	// Like getBookWithMetadata, but recovers the book's org when it's outside the
	// caller's active org (returns `switchedOrgId` so the client can switch).
	getBookResolvingOrg: protectedProcedure
		.input(BookUuidInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			const result = await bookService.getBookResolvingOrg(
				input.uuid,
				context.session.user.id,
				serverId,
				scope,
				context.session.user.role === "admin",
			);
			return {
				...result,
				book: stripBookId(result.book),
			};
		}),

	listRecent: protectedProcedure
		.input(ListRecentBooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			const books = await bookService.getRecentBooks(
				input?.limit ?? 20,
				serverId,
				scope,
			);
			return books.map(stripBookId);
		}),

	listRandom: protectedProcedure
		.input(ListRandomBooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			const books = await bookService.getRandomBooks(
				input?.limit ?? 15,
				serverId,
				scope,
			);
			return books.map(stripBookId);
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

	reindex: adminProcedure.handler(async () => {
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

	listAll: protectedProcedure
		.input(ListAllBooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listAllBooks(serverId, scope, {
				mediaType: input.mediaType,
				limit: input.limit,
				offset: input.cursor,
				sort: input.sort,
				query: input.query,
				minRating: input.minRating,
			});
		}),

	countAll: protectedProcedure
		.input(CountAllBooksInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return 0;
			return bookRepository.countAllBooks(serverId, scope, {
				mediaType: input.mediaType,
				query: input.query,
				minRating: input.minRating,
			});
		}),

	availableFormats: protectedProcedure.handler(async ({ context }) => {
		const { serverId, scope } = await resolveBookScope(context.session);
		if (!serverId) return { books: false, audiobooks: false };
		return bookRepository.availableFormats(serverId, scope);
	}),

	listBySeries: protectedProcedure
		.input(ListBooksBySeriesInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listBySeriesUuid(input.seriesUuid, serverId, scope);
		}),

	listByGenre: protectedProcedure
		.input(ListBooksByGenreInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listByGenreUuid(input.genreUuid, serverId, scope);
		}),

	listByTag: protectedProcedure
		.input(ListBooksByTagInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listByTagUuid(input.tagUuid, serverId, scope);
		}),

	listByPublisher: protectedProcedure
		.input(ListBooksByPublisherInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			return bookRepository.listByPublisherUuid(
				input.publisherUuid,
				serverId,
				scope,
			);
		}),

	listByLibrary: protectedProcedure
		.input(ListBooksByLibraryInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return [];
			const lib = await libraryRepository.getIdAndMediaTypeByUuid(
				input.libraryUuid,
				serverId,
			);
			if (lib == null) throw new NotFoundError("Library not found");
			return bookRepository.listByLibraryId(lib.id, serverId, scope, {
				mediaType: lib.mediaType,
				limit: input.limit,
				offset: input.cursor,
				sort: input.sort,
				query: input.query,
				minRating: input.minRating,
				genres: input.genres,
				year: input.year,
				tags: input.tags,
			});
		}),

	countByLibrary: protectedProcedure
		.input(CountBooksByLibraryInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return 0;
			const lib = await libraryRepository.getIdAndMediaTypeByUuid(
				input.libraryUuid,
				serverId,
			);
			if (lib == null) throw new NotFoundError("Library not found");
			return bookRepository.countByLibraryId(
				lib.id,
				serverId,
				lib.mediaType,
				scope,
				{
					query: input.query,
					minRating: input.minRating,
					genres: input.genres,
					tags: input.tags,
					year: input.year,
				},
			);
		}),

	libraryFacets: protectedProcedure
		.input(LibraryFacetsInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			if (!serverId) return { genres: [], tags: [], years: [] };
			const lib = await libraryRepository.getIdAndMediaTypeByUuid(
				input.libraryUuid,
				serverId,
			);
			if (lib == null) throw new NotFoundError("Library not found");
			return bookRepository.getLibraryFacets(
				lib.id,
				serverId,
				lib.mediaType,
				scope,
			);
		}),

	// Manual fix-match: search a provider for candidates the user picks from.
	searchMetadata: protectedProcedure
		.input(SearchBookMetadataInput)
		.handler(async ({ input, context }) => {
			const { serverId, scope } = await resolveBookScope(context.session);
			const book = await bookService.getBookWithMetadata(
				input.uuid,
				serverId,
				scope,
			);
			return bookMetadataService.searchProvider(input.provider, book.id, {
				title: input.title,
				author: input.author,
				asin: input.asin,
			});
		}),

	// Manual fix-match: apply the chosen candidate's full record. Locked fields
	// still win over the re-match.
	applyMetadata: protectedProcedure
		.input(ApplyBookMetadataInput)
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
			const result = await bookMetadataService.applyFromProvider(
				input.provider,
				{
					bookId: book.id,
					uuid: book.uuid,
					providerId: input.providerId,
				},
			);
			return { success: result !== null };
		}),

	// Manual per-field edit: saves and locks the edited fields so enrichment
	// never overwrites them; unlockFields re-opens fields to enrichment.
	updateMetadata: protectedProcedure
		.input(UpdateBookMetadataInput)
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
			await bookMetadataService.applyManualEdit(
				book.id,
				input.metadata,
				input.unlockFields,
			);
			return { success: true };
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
