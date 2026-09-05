import { expect, mock, test } from "bun:test";

const bookHits = Array.from({ length: 30 }, (_, i) => ({
	uuid: `book-${i}`,
	filename: "a.epub",
	title: "Test",
	authors: [],
}));
const audioHits = Array.from({ length: 30 }, (_, i) => ({
	uuid: `audio-${i}`,
	filename: "a.m4b",
	title: "Test",
	authors: [],
}));
const searchBooks = mock(async ({ limit }: { limit: number }) => ({
	books: bookHits.slice(0, limit),
	pagination: {
		cursor: "books-next",
		hasMore: true,
		totalHits: 90,
		totalHitsRelation: "eq",
	},
}));
const searchAudiobooks = mock(async ({ limit }: { limit: number }) => ({
	audiobooks: audioHits.slice(0, limit),
	pagination: {
		cursor: "audio-next",
		hasMore: true,
		totalHits: 90,
		totalHitsRelation: "eq",
	},
}));
const seriesBatch = mock(async () => []);
const authorBatch = mock(async () => []);
const collections = mock(async () => []);
mock.module("../../books/book.service", () => ({ searchBooks }));
mock.module("../../audiobooks/audiobook.service", () => ({ searchAudiobooks }));
mock.module("../../../infrastructure/search", () => ({
	search: {
		searchSeries: async () => ({ series: [{ uuid: "s1" }, { uuid: "s2" }] }),
		searchAuthors: async () => ({ authors: [{ uuid: "a1" }] }),
	},
}));
mock.module("../../authors/author.repository", () => ({
	authorRepository: { getVisibleHitsByUuids: authorBatch },
}));
mock.module("../../series/series.repository", () => ({
	seriesRepository: { getVisibleHitsByUuids: seriesBatch },
}));
mock.module("../../collections/collections.service", () => ({
	searchCollections: collections,
}));
mock.module("../../read-listen/read-listen.service", () => ({
	readListenService: { searchPairings: async () => [] },
}));
mock.module("../../users/users.repository", () => ({
	usersRepository: { search: async () => [] },
}));
mock.module("../../../auth/access.service", () => ({ hasGlobal: () => false }));
const { topResults } = await import("../search.service");

test("optional media pages reuse one search per format without changing suggestion ranking or scope", async () => {
	const input = {
		query: "Test",
		limit: 20,
		userId: "user-a",
		serverId: "server-a",
		accessibleLibraryIds: [7],
		pc: {} as never,
	};
	const suggestions = await topResults(input);
	expect(suggestions.mediaPages).toBeUndefined();
	expect(searchBooks.mock.calls[0]?.[0]).toMatchObject({
		limit: 8,
		serverId: "server-a",
		accessibleLibraryIds: [7],
	});
	expect(searchAudiobooks.mock.calls[0]?.[0]).toMatchObject({
		limit: 6,
		serverId: "server-a",
		accessibleLibraryIds: [7],
	});
	searchBooks.mockClear();
	searchAudiobooks.mockClear();
	const initial = await topResults({ ...input, pageSize: 30 });
	expect(searchBooks).toHaveBeenCalledTimes(1);
	expect(searchAudiobooks).toHaveBeenCalledTimes(1);
	expect(initial.hits).toEqual(suggestions.hits);
	expect(initial.availableTypes).toEqual(suggestions.availableTypes);
	expect(initial.mediaPages?.books.books).toHaveLength(30);
	expect(initial.mediaPages?.audiobooks.audiobooks).toHaveLength(30);
	expect(initial.mediaPages?.books.pagination.cursor).toBe("books-next");
	expect(initial.mediaPages?.audiobooks.pagination.cursor).toBe("audio-next");
	expect(seriesBatch).toHaveBeenLastCalledWith(["s1", "s2"], "server-a", [7]);
	expect(authorBatch).toHaveBeenLastCalledWith(["a1"], "server-a", [7]);
	expect(collections).not.toHaveBeenCalled();
});
