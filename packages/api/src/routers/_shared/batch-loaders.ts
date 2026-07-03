import { db } from "@nanahoshi-v2/db";
import {
	audiobookAuthor,
	author,
	bookAuthor,
	bookNarrator,
	narrator,
} from "@nanahoshi-v2/db/schema/general";
import { eq, inArray } from "drizzle-orm";

export type AuthorInfo = {
	uuid: string;
	name: string;
	role: string;
};
export type AuthorInfoFull = AuthorInfo & { provider: string | null };
export type NarratorInfo = { uuid: string; name: string };

/**
 * Shared dataloader-style batch queries: resolve authors/narrators for many
 * books in one query, returning a bookId → entries map. Used by the catalog
 * repositories to avoid N+1 lookups.
 */
export class BatchLoaderRepository {
	async loadEbookAuthors(
		bookIds: number[],
	): Promise<Map<number, AuthorInfo[]>> {
		const map = new Map<number, AuthorInfo[]>();
		if (bookIds.length === 0) return map;

		const rows = await db
			.select({
				bookId: bookAuthor.bookId,
				uuid: author.uuid,
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
				uuid: row.uuid,
				name: row.name,
				role: row.role ?? "Author",
			});
			map.set(key, list);
		}
		return map;
	}

	async loadAudiobookAuthors(
		bookIds: number[],
	): Promise<Map<number, AuthorInfoFull[]>> {
		const map = new Map<number, AuthorInfoFull[]>();
		if (bookIds.length === 0) return map;

		const rows = await db
			.select({
				bookId: audiobookAuthor.bookId,
				uuid: author.uuid,
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
				uuid: row.uuid,
				name: row.name,
				role: row.role ?? "Author",
				provider: row.provider,
			});
			map.set(key, list);
		}
		return map;
	}

	async loadNarrators(bookIds: number[]): Promise<Map<number, NarratorInfo[]>> {
		const map = new Map<number, NarratorInfo[]>();
		if (bookIds.length === 0) return map;

		const rows = await db
			.select({
				bookId: bookNarrator.bookId,
				uuid: narrator.uuid,
				name: narrator.name,
			})
			.from(bookNarrator)
			.innerJoin(narrator, eq(narrator.id, bookNarrator.narratorId))
			.where(inArray(bookNarrator.bookId, bookIds));

		for (const row of rows) {
			const key = Number(row.bookId);
			const list = map.get(key) ?? [];
			list.push({ uuid: row.uuid, name: row.name });
			map.set(key, list);
		}
		return map;
	}
}

export const batchLoaderRepository = new BatchLoaderRepository();
