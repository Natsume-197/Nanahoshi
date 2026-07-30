import { db } from "@nanahoshi-v2/db";
import {
	audiobookMetadata,
	book,
	bookMetadata,
	library,
	userAudiobookShelf,
	userBookShelf,
} from "@nanahoshi-v2/db/schema/general";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";

type StatusCount = { status: string; total: number };
type StatusCover = { status: string; cover: string | null; updatedAt: string };

/**
 * Data access for the unified reading-status shelves surfaced on the collections
 * page. Book/audiobook listing (with authors) is reused from the per-format
 * shelf repositories in the service; this repository only owns the summary
 * aggregates that span both shelf tables.
 */
export class ShelvesRepository {
	async ebookCounts(
		userId: string,
		serverId: string,
		scope: LibraryScope,
	): Promise<StatusCount[]> {
		return db
			.select({ status: userBookShelf.status, total: count() })
			.from(userBookShelf)
			.innerJoin(book, eq(book.id, userBookShelf.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(userBookShelf.userId, userId),
					eq(library.serverId, serverId),
					eq(library.mediaType, "ebook"),
					accessibleCondition(scope),
				),
			)
			.groupBy(userBookShelf.status);
	}

	async audiobookCounts(
		userId: string,
		serverId: string,
		scope: LibraryScope,
	): Promise<StatusCount[]> {
		return db
			.select({ status: userAudiobookShelf.status, total: count() })
			.from(userAudiobookShelf)
			.innerJoin(book, eq(book.id, userAudiobookShelf.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(userAudiobookShelf.userId, userId),
					eq(library.serverId, serverId),
					eq(library.mediaType, "audiobook"),
					accessibleCondition(scope),
				),
			)
			.groupBy(userAudiobookShelf.status);
	}

	async ebookRecentCovers(
		userId: string,
		serverId: string,
		scope: LibraryScope,
		limit = 60,
	): Promise<StatusCover[]> {
		return db
			.select({
				status: userBookShelf.status,
				cover: bookMetadata.cover,
				updatedAt: userBookShelf.updatedAt,
			})
			.from(userBookShelf)
			.innerJoin(book, eq(book.id, userBookShelf.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.innerJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(userBookShelf.userId, userId),
					eq(library.serverId, serverId),
					eq(library.mediaType, "ebook"),
					accessibleCondition(scope),
					isNotNull(bookMetadata.cover),
				),
			)
			.orderBy(desc(userBookShelf.updatedAt))
			.limit(limit);
	}

	async audiobookRecentCovers(
		userId: string,
		serverId: string,
		scope: LibraryScope,
		limit = 60,
	): Promise<StatusCover[]> {
		return db
			.select({
				status: userAudiobookShelf.status,
				cover: audiobookMetadata.cover,
				updatedAt: userAudiobookShelf.updatedAt,
			})
			.from(userAudiobookShelf)
			.innerJoin(book, eq(book.id, userAudiobookShelf.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.innerJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(
				and(
					eq(userAudiobookShelf.userId, userId),
					eq(library.serverId, serverId),
					eq(library.mediaType, "audiobook"),
					accessibleCondition(scope),
					isNotNull(audiobookMetadata.cover),
				),
			)
			.orderBy(desc(userAudiobookShelf.updatedAt))
			.limit(limit);
	}
}

export const shelvesRepository = new ShelvesRepository();
