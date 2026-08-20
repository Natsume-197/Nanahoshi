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
import type { TopHit } from "./search.model";
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
	limit: number;
	userId: string;
	serverId: string;
	accessibleLibraryIds: LibraryScope;
	pc: PermissionContext;
}): Promise<TopHit[]> {
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
			limit: BOOK_POOL,
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
			limit: AUDIOBOOK_POOL,
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
		Promise.all(
			seriesRes.series.map((hit) =>
				seriesRepository.getVisibleHitByUuid(
					hit.uuid,
					serverId,
					accessibleLibraryIds,
				),
			),
		).then((hits) =>
			hits.filter((hit): hit is NonNullable<typeof hit> => hit != null),
		),
		Promise.all(
			authorsRes.authors.map((hit) =>
				authorRepository.getVisibleHitByUuid(
					hit.uuid,
					serverId,
					accessibleLibraryIds,
				),
			),
		).then((hits) =>
			hits.filter((hit): hit is NonNullable<typeof hit> => hit != null),
		),
	]);

	return rankTopResults(
		{
			books: books.books,
			series,
			authors,
			audiobooks: audiobooks.audiobooks,
			readListen,
			collections,
			users,
		},
		query,
		limit,
	);
}
