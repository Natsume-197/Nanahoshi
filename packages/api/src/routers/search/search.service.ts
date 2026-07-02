import { hasGlobal, type PermissionContext } from "../../auth/access.service";
import { getSearchProvider } from "../../infrastructure/search/search.factory";
import type { LibraryScope } from "../_shared/library-scope";
import * as audiobookService from "../audiobooks/audiobook.service";
import * as bookService from "../books/book.service";
import * as collectionsService from "../collections/collections.service";
import { usersRepository } from "../users/users.repository";
import type { TopHit } from "./search.model";
import { rankTopResults } from "./search.ranking";

// Per-type candidate pool sizes. Small on purpose: the provider already
// relevance-ranks each pool, the re-ranker only merges across types.
const BOOK_POOL = 8;
const SERIES_POOL = 6;
const AUTHOR_POOL = 6;
const AUDIOBOOK_POOL = 6;
const COLLECTION_POOL = 4;
const USER_POOL = 4;

export async function topResults(input: {
	query: string;
	limit: number;
	userId: string;
	serverId: string;
	accessibleLibraryIds: LibraryScope;
	pc: PermissionContext;
}): Promise<TopHit[]> {
	const { query, limit, userId, serverId, accessibleLibraryIds, pc } = input;
	const provider = getSearchProvider();

	const [books, seriesRes, authorsRes, audiobooks, collections, users] =
		await Promise.all([
			bookService.searchBooks({
				query,
				limit: BOOK_POOL,
				sort: "relevance",
				serverId,
				accessibleLibraryIds,
			}),
			provider.searchSeries({ query, serverId, limit: SERIES_POOL }),
			provider.searchAuthors({ query, serverId, limit: AUTHOR_POOL }),
			audiobookService.searchAudiobooks({
				query,
				limit: AUDIOBOOK_POOL,
				sort: "relevance",
				serverId,
				accessibleLibraryIds,
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

	return rankTopResults(
		{
			books: books.books,
			series: seriesRes.series,
			authors: authorsRes.authors,
			audiobooks: audiobooks.audiobooks,
			collections,
			users,
		},
		query,
		limit,
	);
}
