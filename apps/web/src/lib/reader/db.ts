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

export async function cacheBook(book: ReaderBookData): Promise<void> {
	try {
		const db = getDb();
		await db.books.put(book);

		const count = await db.books.count();
		if (count > MAX_CACHED_BOOKS) {
			const oldest = await db.books
				.orderBy("storedAt")
				.limit(count - MAX_CACHED_BOOKS)
				.toArray();
			await db.books.bulkDelete(oldest.map((b) => b.uuid));
		}
	} catch (error) {
		console.warn("Failed to write reader cache:", error);
	}
}
