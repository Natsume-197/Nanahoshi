import { hasGlobal, type PermissionContext } from "../../auth/access.service";
import { search } from "../../infrastructure/search";
import type { LibraryScope } from "../_shared/library-scope";
import * as audiobookService from "../audiobooks/audiobook.service";
import { authorRepository } from "../authors/author.repository";
import * as bookService from "../books/book.service";
import * as collectionsService from "../collections/collections.service";
import { narratorRepository } from "../narrators/narrator.repository";
import { readListenService } from "../read-listen/read-listen.service";
import { seriesRepository } from "../series/series.repository";
import { usersRepository } from "../users/users.repository";
import type { TopSearchResults } from "./search.model";
import { rankTopResults } from "./search.ranking";

// Per-type candidate pool sizes. Small on purpose: the provider already
// relevance-ranks each pool, the re-ranker only merges across types.
const BOOK_POOL = 8;
const SERIES_POOL = 6;
const AUTHOR_POOL = 6;
const NARRATOR_POOL = 6;
const AUDIOBOOK_POOL = 6;
const READ_LISTEN_POOL = 6;
const COLLECTION_POOL = 4;
const USER_POOL = 4;

export async function topResults(input: {
	query: string;
	pageSize?: number;
	limit: number;
	userId: string;
	serverId: string;
	accessibleLibraryIds: LibraryScope;
	pc: PermissionContext;
}): Promise<TopSearchResults> {
	const { query, limit, userId, serverId, accessibleLibraryIds, pc } = input;
	const [
		books,
		seriesRes,
		audiobookSeries,
		authorsRes,
		narrators,
		audiobooks,
		readListen,
		collections,
		users,
	] = await Promise.all([
		bookService.searchBooks({
			query,
			limit: input.pageSize ?? BOOK_POOL,
			sort: "relevance",
			serverId,
			accessibleLibraryIds,
		}),
		search.searchSeries({
			query,
			serverId,
			accessibleLibraryIds,
			limit: SERIES_POOL,
		}),
		audiobookService.listAudiobookSeries(
			serverId,
			{ query, limit: SERIES_POOL, sort: "name" },
			accessibleLibraryIds,
		),
		search.searchAuthors({
			query,
			serverId,
			accessibleLibraryIds,
			limit: AUTHOR_POOL,
		}),
		narratorRepository.listWithAudiobookCount(
			serverId,
			{ query, limit: NARRATOR_POOL, sort: "name" },
			accessibleLibraryIds,
		),
		audiobookService.searchAudiobooks({
			query,
			limit: input.pageSize ?? AUDIOBOOK_POOL,
			sort: "relevance",
			serverId,
			accessibleLibraryIds,
		}),
		readListenService.searchPairings({
			query,
			limit: READ_LISTEN_POOL,
			serverId,
			scope: accessibleLibraryIds,
		}),
		hasGlobal(pc, "collection", "read")
			? collectionsService.searchCollections(
					userId,
					serverId,
					query,
					COLLECTION_POOL,
				)
			: Promise.resolve([]),
		usersRepository.search(query, serverId, userId, USER_POOL),
	]);
	const [bookSeries, authors] = await Promise.all([
		seriesRepository.getVisibleHitsByUuids(
			seriesRes.series.map((hit) => hit.uuid),
			serverId,
			accessibleLibraryIds,
		),
		authorRepository.getVisibleHitsByUuids(
			authorsRes.authors.map((hit) => hit.uuid),
			serverId,
			accessibleLibraryIds,
		),
	]);
	const series = [
		...bookSeries.map((entry) => ({ ...entry, mediaType: "ebook" as const })),
		...audiobookSeries.map((entry) => ({
			...entry,
			mediaType: "audiobook" as const,
			bookCount: entry.audiobookCount,
			previewCovers: entry.cover ? [entry.cover] : [],
		})),
	];

	const pools = {
		books: books.books.slice(0, BOOK_POOL),
		series,
		authors,
		narrators,
		audiobooks: audiobooks.audiobooks.slice(0, AUDIOBOOK_POOL),
		readListen,
		collections,
		users,
	};
	const availableTypes = [
		...(pools.books.length ? ["book" as const] : []),
		...(pools.series.length ? ["series" as const] : []),
		...(pools.authors.length ? ["author" as const] : []),
		...(pools.narrators.length ? ["narrator" as const] : []),
		...(pools.audiobooks.length ? ["audiobook" as const] : []),
		...(pools.readListen.length ? ["read-listen" as const] : []),
		...(pools.collections.length ? ["collection" as const] : []),
		...(pools.users.length ? ["user" as const] : []),
	];

	return {
		hits: rankTopResults(pools, query, limit),
		availableTypes,
		...(input.pageSize ? { mediaPages: { books, audiobooks } } : {}),
	};
}
