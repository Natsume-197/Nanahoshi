import { db } from "@nanahoshi-v2/db";
import {
	audiobookAuthor,
	author,
	bookAuthor,
	bookNarrator,
	narrator,
} from "@nanahoshi-v2/db/schema/general";
import { eq, inArray } from "drizzle-orm";

export type AuthorInfo = { id: number; name: string; role: string };
export type AuthorInfoFull = AuthorInfo & { provider: string | null };
export type NarratorInfo = { id: number; name: string };

/**
 * Batch-load ebook authors for a set of book IDs.
 * Returns a map of bookId → authors array.
 */
export async function batchLoadEbookAuthors(
	bookIds: number[],
): Promise<Map<number, AuthorInfo[]>> {
	const map = new Map<number, AuthorInfo[]>();
	if (bookIds.length === 0) return map;

	const rows = await db
		.select({
			bookId: bookAuthor.bookId,
			authorId: author.id,
			name: author.name,
			role: bookAuthor.role,
		})
		.from(bookAuthor)
		.innerJoin(author, eq(author.id, bookAuthor.authorId))
		.where(inArray(bookAuthor.bookId, bookIds));

	for (const row of rows) {
		const key = Number(row.bookId);
		const list = map.get(key) ?? [];
		list.push({
			id: row.authorId,
			name: row.name,
			role: row.role ?? "Author",
		});
		map.set(key, list);
	}
	return map;
}

/**
 * Batch-load audiobook authors for a set of book IDs.
 * Returns a map of bookId → authors array (includes provider).
 */
export async function batchLoadAudiobookAuthors(
	bookIds: number[],
): Promise<Map<number, AuthorInfoFull[]>> {
	const map = new Map<number, AuthorInfoFull[]>();
	if (bookIds.length === 0) return map;

	const rows = await db
		.select({
			bookId: audiobookAuthor.bookId,
			authorId: author.id,
			name: author.name,
			role: audiobookAuthor.role,
			provider: author.provider,
		})
		.from(audiobookAuthor)
		.innerJoin(author, eq(author.id, audiobookAuthor.authorId))
		.where(inArray(audiobookAuthor.bookId, bookIds));

	for (const row of rows) {
		const key = Number(row.bookId);
		const list = map.get(key) ?? [];
		list.push({
			id: row.authorId,
			name: row.name,
			role: row.role ?? "Author",
			provider: row.provider,
		});
		map.set(key, list);
	}
	return map;
}

/**
 * Batch-load narrators for a set of book IDs.
 * Returns a map of bookId → narrators array.
 */
export async function batchLoadNarrators(
	bookIds: number[],
): Promise<Map<number, NarratorInfo[]>> {
	const map = new Map<number, NarratorInfo[]>();
	if (bookIds.length === 0) return map;

	const rows = await db
		.select({
			bookId: bookNarrator.bookId,
			narratorId: narrator.id,
			name: narrator.name,
		})
		.from(bookNarrator)
		.innerJoin(narrator, eq(narrator.id, bookNarrator.narratorId))
		.where(inArray(bookNarrator.bookId, bookIds));

	for (const row of rows) {
		const key = Number(row.bookId);
		const list = map.get(key) ?? [];
		list.push({ id: row.narratorId, name: row.name });
		map.set(key, list);
	}
	return map;
}
