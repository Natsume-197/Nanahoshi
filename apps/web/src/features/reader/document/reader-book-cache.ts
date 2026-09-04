import type {
	ReaderBookData,
	ReaderSourceFormat,
	Section,
} from "@/features/reader/document/types";
import { clearReaderBookMemoryCache } from "./reader-book-memory-cache";

const DATABASE_NAME = "NanahoshiReaderCache";
const DATABASE_VERSION = 1;
const FILES_STORE = "files";
const FACTS_STORE = "facts";
const FACTS_SCHEMA_VERSION = 3;

export interface ReaderBookCacheKey {
	serverId: string;
	uuid: string;
	/** Content identity from the scanner, never a signed download URL. */
	fileHash: string;
}

/** Persisted facts let an unchanged book skip its second full DOM recount. */
export interface ReaderBookFacts {
	schemaVersion: typeof FACTS_SCHEMA_VERSION;
	sourceFormat?: ReaderSourceFormat;
	contentForm?: ReaderBookData["contentForm"];
	characters: number;
	sections: Section[];
	/** Exact per-spine counts, including child sections and empty covers. */
	sectionCharacterCounts: number[];
}

interface CachedFile {
	id: string;
	fileHash: string;
	blob: Blob;
}

interface CachedFacts {
	id: string;
	fileHash: string;
	facts: ReaderBookFacts;
}

let databasePromise: Promise<IDBDatabase | undefined> | undefined;
let cacheGeneration = 0;

/** Capture before loading so sign-out also invalidates work still parsing. */
export function getReaderBookCacheGeneration(): number {
	return cacheGeneration;
}

export function canCacheReaderBook(
	key: Omit<ReaderBookCacheKey, "fileHash"> & { fileHash?: string | null },
): key is ReaderBookCacheKey {
	return Boolean(key.serverId && key.uuid && key.fileHash);
}

export async function getCachedReaderBookFile(
	key: ReaderBookCacheKey,
): Promise<Blob | undefined> {
	const record = await readRecord<CachedFile>(FILES_STORE, recordId(key));
	return record?.fileHash === key.fileHash ? record.blob : undefined;
}

export async function putCachedReaderBookFile(
	key: ReaderBookCacheKey,
	blob: Blob,
	generation: number,
): Promise<void> {
	await writeRecord(
		FILES_STORE,
		{
			id: recordId(key),
			fileHash: key.fileHash,
			blob,
		} satisfies CachedFile,
		generation,
	);
}

export async function getReaderBookFacts(
	key: ReaderBookCacheKey,
): Promise<ReaderBookFacts | undefined> {
	const record = await readRecord<CachedFacts>(FACTS_STORE, recordId(key));
	return record?.fileHash === key.fileHash && isReaderBookFacts(record.facts)
		? record.facts
		: undefined;
}

export async function putReaderBookFacts(
	key: ReaderBookCacheKey,
	facts: ReaderBookFacts,
	generation: number,
): Promise<void> {
	await writeRecord(
		FACTS_STORE,
		{
			id: recordId(key),
			fileHash: key.fileHash,
			facts,
		} satisfies CachedFacts,
		generation,
	);
}

/** Deletes private book bytes and facts when the browser identity changes. */
export async function clearReaderBookCache(): Promise<void> {
	cacheGeneration += 1;
	clearReaderBookMemoryCache();
	if (typeof indexedDB === "undefined") return;
	const openDatabase = databasePromise ? await databasePromise : undefined;
	openDatabase?.close();
	databasePromise = undefined;
	await new Promise<void>((resolve) => {
		try {
			const request = indexedDB.deleteDatabase(DATABASE_NAME);
			request.onsuccess = () => resolve();
			request.onerror = () => resolve();
			request.onblocked = () => resolve();
		} catch {
			resolve();
		}
	});
}

export function readerBookFactsFromData(
	data: ReaderBookData,
): ReaderBookFacts | undefined {
	if (!data.sectionCharacterCounts) return undefined;
	return {
		schemaVersion: FACTS_SCHEMA_VERSION,
		sourceFormat: data.sourceFormat,
		contentForm: data.contentForm,
		characters: data.characters,
		sections: data.sections.map((section) => ({ ...section })),
		sectionCharacterCounts: data.sectionCharacterCounts.slice(),
	};
}

/** Returns undefined when fresh parsing disagrees with the cached facts. */
export function applyReaderBookFacts(
	data: ReaderBookData,
	facts: ReaderBookFacts | undefined,
): ReaderBookData | undefined {
	if (!facts || !isReaderBookFacts(facts)) return undefined;
	if (facts.sourceFormat !== data.sourceFormat) return undefined;
	if (facts.sections.length !== data.sections.length) return undefined;
	if (facts.sectionCharacterCounts.length !== data.sections.length)
		return undefined;
	if (
		facts.sections.some(
			(section, index) => section.reference !== data.sections[index]?.reference,
		)
	) {
		return undefined;
	}

	return {
		...data,
		contentForm: facts.contentForm,
		characters: facts.characters,
		sectionCharacterCounts: facts.sectionCharacterCounts,
		sections: facts.sections.map((fact, index) => ({
			...fact,
			label: data.sections[index]?.label ?? fact.label,
		})),
	};
}

function recordId(key: ReaderBookCacheKey) {
	return `${key.serverId}:${key.uuid}`;
}

function isReaderBookFacts(value: unknown): value is ReaderBookFacts {
	if (!value || typeof value !== "object") return false;
	const facts = value as Partial<ReaderBookFacts>;
	return (
		facts.schemaVersion === FACTS_SCHEMA_VERSION &&
		typeof facts.characters === "number" &&
		Number.isFinite(facts.characters) &&
		facts.characters >= 0 &&
		Array.isArray(facts.sections) &&
		Array.isArray(facts.sectionCharacterCounts) &&
		facts.sectionCharacterCounts.every(
			(count) =>
				typeof count === "number" && Number.isFinite(count) && count >= 0,
		) &&
		facts.sections.every(
			(section) =>
				Boolean(section) &&
				typeof section.reference === "string" &&
				typeof section.charactersWeight === "number",
		)
	);
}

async function readRecord<T>(
	storeName: typeof FILES_STORE | typeof FACTS_STORE,
	id: string,
): Promise<T | undefined> {
	const database = await openDatabase();
	if (!database) return undefined;
	try {
		const transaction = database.transaction(storeName, "readonly");
		const request = transaction.objectStore(storeName).get(id);
		return (await requestResult<T | undefined>(request)) ?? undefined;
	} catch {
		return undefined;
	}
}

async function writeRecord(
	storeName: typeof FILES_STORE | typeof FACTS_STORE,
	record: CachedFile | CachedFacts,
	generation: number,
): Promise<void> {
	if (generation !== cacheGeneration) return;
	const database = await openDatabase();
	if (!database || generation !== cacheGeneration) return;
	try {
		const transaction = database.transaction(storeName, "readwrite");
		transaction.objectStore(storeName).put(record);
		await transactionDone(transaction);
	} catch {
		// Cache quota/privacy failures must never prevent reading a book.
	}
}

function openDatabase(): Promise<IDBDatabase | undefined> {
	if (databasePromise) return databasePromise;
	if (typeof indexedDB === "undefined") return Promise.resolve(undefined);

	databasePromise = new Promise((resolve) => {
		try {
			const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains(FILES_STORE)) {
					database.createObjectStore(FILES_STORE, { keyPath: "id" });
				}
				if (!database.objectStoreNames.contains(FACTS_STORE)) {
					database.createObjectStore(FACTS_STORE, { keyPath: "id" });
				}
			};
			request.onsuccess = () => {
				request.result.onversionchange = () => request.result.close();
				resolve(request.result);
			};
			request.onerror = () => resolve(undefined);
			request.onblocked = () => resolve(undefined);
		} catch {
			resolve(undefined);
		}
	});
	return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}
