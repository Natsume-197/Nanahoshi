import Dexie, { type Table } from "dexie";
import type { ReaderBookData, ReaderSourceFormat } from "./types";

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

// IndexedDB transactions can block forever (e.g. a frozen background tab
// holding a readwrite lock on `books`), so cache operations race a timeout and
// the reader degrades to cache-less instead of hanging on the loading screen.
const READ_TIMEOUT_MS = 3_000;
const WRITE_TIMEOUT_MS = 5_000;
const REBUILD_AFTER_WRITE_FAILURES = 2;
const REBUILD_TIMEOUT_MS = 30_000;
// Persisted so the streak survives page reloads (one book open = one write).
const WRITE_FAILURE_STREAK_KEY = "nanahoshi-reader-cache-write-failures";

let rebuilding = false;

function getWriteFailureStreak(): number {
	try {
		return Number(window.localStorage.getItem(WRITE_FAILURE_STREAK_KEY)) || 0;
	} catch {
		return 0;
	}
}

function setWriteFailureStreak(value: number) {
	try {
		if (value === 0) {
			window.localStorage.removeItem(WRITE_FAILURE_STREAK_KEY);
		} else {
			window.localStorage.setItem(WRITE_FAILURE_STREAK_KEY, String(value));
		}
	} catch {
		// localStorage unavailable: streak just won't persist
	}
}

// A timed-out op usually means our connection is wedged (zombie transaction,
// broken backend). Dropping it lets the next op open a fresh connection.
function recycleDb() {
	try {
		dbInstance?.close();
	} catch {
		// closing a broken connection may itself throw
	}
	dbInstance = undefined;
}

// Writes hanging/failing repeatedly means the database backend itself is
// broken (a fresh connection didn't help). The cache is a disposable LRU, so
// drop and recreate the database instead of staying broken until the user
// clears site data. Deletion can itself block on foreign zombie connections
// (Dexie tabs auto-close on versionchange, frozen tabs don't), hence the race.
async function rebuildDb() {
	if (rebuilding) return;
	rebuilding = true;
	console.warn("Reader cache backend unresponsive, rebuilding database");
	recycleDb();
	try {
		await Promise.race([
			Dexie.delete(DB_NAME),
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error("delete timed out")),
					REBUILD_TIMEOUT_MS,
				),
			),
		]);
		setWriteFailureStreak(0);
		console.warn("Reader cache database rebuilt");
	} catch (error) {
		console.warn("Reader cache rebuild failed:", error);
	} finally {
		rebuilding = false;
	}
}

function onWriteFailure() {
	const streak = getWriteFailureStreak() + 1;
	setWriteFailureStreak(streak);
	if (streak >= REBUILD_AFTER_WRITE_FAILURES) {
		void rebuildDb();
	}
}

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	fallback: T,
	label: string,
	kind: "read" | "write" = "read",
): Promise<T> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			console.warn(`Reader cache ${label} timed out after ${ms}ms`);
			recycleDb();
			if (kind === "write") onWriteFailure();
			resolve(fallback);
		}, ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				if (kind === "write") setWriteFailureStreak(0);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				console.warn(`Reader cache ${label} failed:`, error);
				if (kind === "write") onWriteFailure();
				resolve(fallback);
			},
		);
	});
}

export function getCachedBook(
	uuid: string,
): Promise<ReaderBookData | undefined> {
	return withTimeout(
		getDb().books.get(uuid),
		READ_TIMEOUT_MS,
		undefined,
		"read",
	);
}

export function cacheBook(
	book: ReaderBookData,
	maxBooks = MAX_CACHED_BOOKS,
): Promise<void> {
	const write = (async () => {
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
	})();
	return withTimeout(write, WRITE_TIMEOUT_MS, undefined, "write", "write");
}

export interface CachedBookSummary {
	uuid: string;
	sourceFormat?: ReaderSourceFormat;
	title: string;
	cover: string | null;
	storedAt: number;
	sizeBytes: number;
}

export function listCachedBooks(
	serverId: string | null,
): Promise<CachedBookSummary[]> {
	const read = (async () => {
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
					sourceFormat: book.sourceFormat,
					title: book.title,
					cover: book.cover ?? null,
					storedAt: book.storedAt,
					sizeBytes,
				});
			});
		return summaries;
	})();
	return withTimeout(read, READ_TIMEOUT_MS, [], "list");
}

export function deleteCachedBook(uuid: string): Promise<void> {
	return withTimeout(
		getDb().books.delete(uuid),
		WRITE_TIMEOUT_MS,
		undefined,
		"delete",
		"write",
	);
}

export function clearCachedBooks(): Promise<void> {
	return withTimeout(
		getDb().books.clear(),
		WRITE_TIMEOUT_MS,
		undefined,
		"clear",
		"write",
	);
}
