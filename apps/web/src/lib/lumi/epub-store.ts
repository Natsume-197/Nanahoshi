// Raw .epub blob cache for the lumi reader, which parses raw bytes itself.

import Dexie, { type Table } from "dexie";

/** A cached raw .epub blob keyed by book uuid. */
interface RawEpub {
	uuid: string;
	blob: Blob;
	storedAt: number;
}

const DB_NAME = "LumiReaderDB";
const DEFAULT_MAX_CACHED = 10;

/** IndexedDB store (via Dexie) holding cached raw .epub blobs. */
class LumiDatabase extends Dexie {
	epubs!: Table<RawEpub, string>;

	constructor() {
		super(DB_NAME);
		this.version(1).stores({ epubs: "uuid, storedAt" });
	}
}

let db: LumiDatabase | undefined;
/** Lazily open the singleton database. */
function getDb(): LumiDatabase {
	if (!db) db = new LumiDatabase();
	return db;
}

/** Read a cached raw .epub blob, or undefined if not stored. */
export async function getRawEpub(uuid: string): Promise<Blob | undefined> {
	const row = await getDb().epubs.get(uuid);
	return row?.blob;
}

/** Cache a raw .epub blob, evicting the oldest beyond `maxCached`. */
export async function putRawEpub(
	uuid: string,
	blob: Blob,
	maxCached = DEFAULT_MAX_CACHED,
): Promise<void> {
	const table = getDb().epubs;
	await table.put({ uuid, blob, storedAt: Date.now() });
	const limit = Math.max(1, maxCached);
	const count = await table.count();
	if (count > limit) {
		const stale = await table
			.orderBy("storedAt")
			.limit(count - limit)
			.primaryKeys();
		await table.bulkDelete(stale);
	}
}
