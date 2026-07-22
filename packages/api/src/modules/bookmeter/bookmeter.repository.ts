import { db } from "@nanahoshi-v2/db";
import { member, user } from "@nanahoshi-v2/db/schema/auth";
import {
	author,
	book,
	bookAuthor,
	bookMetadata,
	library,
	userBookShelf,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { ListStatus } from "../../constants";

const CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

export type BookmeterLink = {
	bookmeterUserId: string | null;
	bookmeterLastSyncedAt: Date | null;
	bookmeterLastSyncResult: string | null;
};

export class BookmeterRepository {
	async getLink(userId: string): Promise<BookmeterLink | null> {
		const [row] = await db
			.select({
				bookmeterUserId: user.bookmeterUserId,
				bookmeterLastSyncedAt: user.bookmeterLastSyncedAt,
				bookmeterLastSyncResult: user.bookmeterLastSyncResult,
			})
			.from(user)
			.where(eq(user.id, userId));
		return row ?? null;
	}

	async setLink(userId: string, bookmeterUserId: string | null): Promise<void> {
		await db
			.update(user)
			.set({
				bookmeterUserId,
				bookmeterLastSyncedAt: null,
				bookmeterLastSyncResult: null,
			})
			.where(eq(user.id, userId));
	}

	async recordSyncResult(userId: string, resultJson: string): Promise<void> {
		await db
			.update(user)
			.set({
				bookmeterLastSyncedAt: new Date(),
				bookmeterLastSyncResult: resultJson,
			})
			.where(eq(user.id, userId));
	}

	async listLinkedUserIds(): Promise<string[]> {
		const rows = await db
			.select({ id: user.id })
			.from(user)
			.where(isNotNull(user.bookmeterUserId));
		return rows.map((r) => r.id);
	}

	async getUserServerIds(userId: string): Promise<string[]> {
		const rows = await db
			.select({ organizationId: member.organizationId })
			.from(member)
			.where(eq(member.userId, userId));
		return rows.map((r) => r.organizationId);
	}

	/** Matches by ASIN or ISBN-10 (print-edition ASINs are ISBN-10s). */
	async findBooksByAmazonIds(
		amazonIds: string[],
		serverIds: string[],
	): Promise<
		Array<{
			bookId: number;
			amazonId: string;
			title: string | null;
			titleRomaji: string | null;
			authors: string[];
		}>
	> {
		if (amazonIds.length === 0 || serverIds.length === 0) return [];
		const results: Array<{
			bookId: number;
			amazonId: string;
			title: string | null;
			titleRomaji: string | null;
			authors: string[];
		}> = [];
		for (const ids of chunk(amazonIds, CHUNK_SIZE)) {
			const rows = await db
				.select({
					bookId: sql<number>`COALESCE(${book.duplicateOfBookId}, ${book.id})`,
					asin: bookMetadata.asin,
					isbn10: bookMetadata.isbn10,
					title: bookMetadata.title,
					titleRomaji: bookMetadata.titleRomaji,
					authors: sql<string[]>`ARRAY(
						SELECT ${author.name}
						FROM ${bookAuthor}
						INNER JOIN ${author} ON ${author.id} = ${bookAuthor.authorId}
						WHERE ${bookAuthor.bookId} = ${book.id}
						  AND lower(coalesce(${bookAuthor.role}, '')) = 'author'
					)`,
				})
				.from(bookMetadata)
				.innerJoin(book, eq(book.id, bookMetadata.bookId))
				.innerJoin(library, eq(library.id, book.libraryId))
				.where(
					and(
						inArray(library.serverId, serverIds),
						eq(library.mediaType, "ebook"),
						or(
							inArray(bookMetadata.asin, ids),
							inArray(bookMetadata.isbn10, ids),
						),
					),
				);
			for (const row of rows) {
				const amazonId = ids.find((id) => id === row.asin || id === row.isbn10);
				if (amazonId) {
					results.push({
						bookId: Number(row.bookId),
						amazonId,
						title: row.title,
						titleRomaji: row.titleRomaji,
						authors: row.authors,
					});
				}
			}
		}
		return results;
	}

	async findBooksByTitles(
		titles: string[],
		serverIds: string[],
	): Promise<Array<{ bookId: number; title: string; authors: string[] }>> {
		if (titles.length === 0 || serverIds.length === 0) return [];
		const results: Array<{ bookId: number; title: string; authors: string[] }> =
			[];
		for (const titleChunk of chunk(titles, CHUNK_SIZE)) {
			const rows = await db
				.select({
					bookId: sql<number>`COALESCE(${book.duplicateOfBookId}, ${book.id})`,
					title: sql<string>`lower(${bookMetadata.title})`,
					authors: sql<string[]>`ARRAY(
						SELECT ${author.name}
						FROM ${bookAuthor}
						INNER JOIN ${author} ON ${author.id} = ${bookAuthor.authorId}
						WHERE ${bookAuthor.bookId} = ${book.id}
						  AND lower(coalesce(${bookAuthor.role}, '')) = 'author'
					)`,
				})
				.from(bookMetadata)
				.innerJoin(book, eq(book.id, bookMetadata.bookId))
				.innerJoin(library, eq(library.id, book.libraryId))
				.where(
					and(
						inArray(library.serverId, serverIds),
						eq(library.mediaType, "ebook"),
						inArray(sql`lower(${bookMetadata.title})`, titleChunk),
					),
				);
			for (const row of rows) {
				results.push({
					bookId: Number(row.bookId),
					title: row.title,
					authors: row.authors,
				});
			}
		}
		return results;
	}

	/** Inserts shelf rows only where none exist — local shelf state always wins. */
	async insertShelfIfAbsent(
		userId: string,
		entries: Array<{ bookId: number; status: ListStatus }>,
	): Promise<number> {
		if (entries.length === 0) return 0;
		const now = new Date().toISOString();
		let added = 0;
		for (const entryChunk of chunk(entries, CHUNK_SIZE)) {
			const rows = await db
				.insert(userBookShelf)
				.values(
					entryChunk.map((entry) => ({
						userId,
						bookId: entry.bookId,
						status: entry.status,
						updatedAt: now,
					})),
				)
				.onConflictDoNothing({
					target: [userBookShelf.userId, userBookShelf.bookId],
				})
				.returning({ bookId: userBookShelf.bookId });
			added += rows.length;
		}
		return added;
	}
}

export const bookmeterRepository = new BookmeterRepository();
