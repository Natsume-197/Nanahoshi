import Dexie, { type Table } from "dexie";
import type { ReaderBookData } from "./types";

const DB_NAME = "NanahoshiReaderDB";
const MAX_CACHED_BOOKS = 10;

class ReaderDatabase extends Dexie {
	books!: Table<ReaderBookData, string>;

	constructor() {
		super(DB_NAME);

		this.version(2).stores({
			books: "uuid, storedAt",
		});
		this.version(3).stores({
			books: "uuid, storedAt, serverId",
		});
	}
}

let dbInstance: ReaderDatabase | undefined;

function getDb() {
	if (!dbInstance) {
		dbInstance = new ReaderDatabase();
	}
	return dbInstance;
}

export async function getCachedBook(
	uuid: string,
): Promise<ReaderBookData | undefined> {
	try {
		return await getDb().books.get(uuid);
	} catch (error) {
		console.warn("Failed to read reader cache:", error);
		return undefined;
	}
}

export async function cacheBook(
	book: ReaderBookData,
	maxBooks = MAX_CACHED_BOOKS,
): Promise<void> {
	try {
		const db = getDb();
		await db.books.put(book);

		const limit = Math.max(1, Math.floor(maxBooks) || MAX_CACHED_BOOKS);
		const count = await db.books.count();
		if (count > limit) {
			const oldest = await db.books
				.orderBy("storedAt")
				.limit(count - limit)
				.toArray();
			await db.books.bulkDelete(oldest.map((b) => b.uuid));
		}
	} catch (error) {
		console.warn("Failed to write reader cache:", error);
	}
}

export interface CachedBookSummary {
	uuid: string;
	title: string;
	cover: string | null;
	storedAt: number;
	sizeBytes: number;
}

export async function listCachedBooks(
	serverId: string | null,
): Promise<CachedBookSummary[]> {
	try {
		const summaries: CachedBookSummary[] = [];
		await getDb()
			.books.orderBy("storedAt")
			.reverse()
			.each((book) => {
				if ((book.serverId ?? null) !== serverId) return;
				let sizeBytes =
					book.elementHtml.length * 2 + book.styleSheet.length * 2;
				for (const blob of Object.values(book.blobs)) {
					sizeBytes += blob.size;
				}
				summaries.push({
					uuid: book.uuid,
					title: book.title,
					cover: book.cover ?? null,
					storedAt: book.storedAt,
					sizeBytes,
				});
			});
		return summaries;
	} catch (error) {
		console.warn("Failed to list reader cache:", error);
		return [];
	}
}

export async function deleteCachedBook(uuid: string): Promise<void> {
	try {
		await getDb().books.delete(uuid);
	} catch (error) {
		console.warn("Failed to delete cached book:", error);
	}
}

export async function clearCachedBooks(): Promise<void> {
	try {
		await getDb().books.clear();
	} catch (error) {
		console.warn("Failed to clear reader cache:", error);
	}
}
