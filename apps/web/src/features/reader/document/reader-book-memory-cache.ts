import type { ReaderBookData } from "@/features/reader/document/types";
import type { ReaderBookCacheKey } from "./reader-book-cache";

const MAX_BOOKS_IN_MEMORY = 2;

interface CachedBookData {
	fileHash: string;
	data: ReaderBookData;
}

// IndexedDB avoids repeat downloads across visits. This tiny LRU avoids
// reparsing the same bytes when the reader remounts or the user changes view
// in one tab. It intentionally stores only two books: EPUB resources can be
// large, and the persistent cache remains the long-term layer.
const books = new Map<string, CachedBookData>();

export function getReaderBookMemoryCache(
	key: ReaderBookCacheKey,
): ReaderBookData | undefined {
	const id = cacheId(key);
	const entry = books.get(id);
	if (!entry || entry.fileHash !== key.fileHash) return undefined;
	// Map insertion order supplies a simple, dependency-free LRU policy.
	books.delete(id);
	books.set(id, entry);
	return cloneReaderBookData(entry.data);
}

export function putReaderBookMemoryCache(
	key: ReaderBookCacheKey,
	data: ReaderBookData,
): void {
	const id = cacheId(key);
	books.delete(id);
	books.set(id, { fileHash: key.fileHash, data: cloneReaderBookData(data) });
	while (books.size > MAX_BOOKS_IN_MEMORY) {
		const oldest = books.keys().next().value;
		if (oldest === undefined) break;
		books.delete(oldest);
	}
}

export function clearReaderBookMemoryCache(): void {
	books.clear();
}

function cacheId(key: ReaderBookCacheKey) {
	return `${key.serverId}:${key.uuid}`;
}

function cloneReaderBookData(data: ReaderBookData): ReaderBookData {
	return {
		...data,
		blobs: { ...data.blobs },
		sections: data.sections.map((section) => ({ ...section })),
		sectionCharacterCounts: data.sectionCharacterCounts?.slice(),
	};
}
