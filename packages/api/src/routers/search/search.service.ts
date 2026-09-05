import { hasGlobal, type PermissionContext } from "../../auth/access.service";
import { search } from "../../infrastructure/search";
import type { LibraryScope } from "../_shared/library-scope";
import * as audiobookService from "../audiobooks/audiobook.service";
import { authorRepository } from "../authors/author.repository";
import * as bookService from "../books/book.service";
import * as collectionsService from "../collections/collections.service";
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
		authorsRes,
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
		search.searchAuthors({
			query,
			serverId,
			accessibleLibraryIds,
			limit: AUTHOR_POOL,
		}),
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
	const [series, authors] = await Promise.all([
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

	const pools = {
		books: books.books.slice(0, BOOK_POOL),
		series,
		authors,
		audiobooks: audiobooks.audiobooks.slice(0, AUDIOBOOK_POOL),
		readListen,
		collections,
		users,
	};
	const availableTypes = [
		...(pools.books.length ? ["book" as const] : []),
		...(pools.series.length ? ["series" as const] : []),
		...(pools.authors.length ? ["author" as const] : []),
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
