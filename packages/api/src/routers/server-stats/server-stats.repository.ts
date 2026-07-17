import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import {
	author,
	book,
	collection,
	library,
	series,
} from "@nanahoshi-v2/db/schema/general";
import { count, eq, sql } from "drizzle-orm";

export class ServerStatsRepository {
	/** Per-server counters for the settings Stats section. */
	async getStats(serverId: string) {
		const [libraryRows, members, authors, seriesRows, collections] =
			await Promise.all([
				// One row per library (empty ones included). Canonical books only for
				// the count — hidden duplicate copies don't inflate it — while disk
				// usage sums every file, duplicates included.
				db
					.select({
						id: library.id,
						name: library.name,
						mediaType: library.mediaType,
						bookCount: sql<string>`count(${book.id}) filter (where ${book.duplicateOfBookId} is null)`,
						storageKb: sql<string>`coalesce(sum(${book.filesizeKb}), 0)`,
					})
					.from(library)
					.leftJoin(book, eq(book.libraryId, library.id))
					.where(eq(library.serverId, serverId))
					.groupBy(library.id),
				db
					.select({ count: count() })
					.from(member)
					.where(eq(member.organizationId, serverId)),
				db
					.select({ count: count() })
					.from(author)
					.where(eq(author.serverId, serverId)),
				db
					.select({ count: count() })
					.from(series)
					.where(eq(series.serverId, serverId)),
				db
					.select({ count: count() })
					.from(collection)
					.where(eq(collection.serverId, serverId)),
			]);

		const libraries = libraryRows.map((row) => ({
			id: row.id,
			name: row.name,
			mediaType: row.mediaType,
			bookCount: Number(row.bookCount ?? 0),
			storageKb: Number(row.storageKb ?? 0),
		}));

		const sumBy = (mediaType: string) =>
			libraries
				.filter((lib) => lib.mediaType === mediaType)
				.reduce((total, lib) => total + lib.bookCount, 0);

		return {
			libraries,
			ebookCount: sumBy("ebook"),
			audiobookCount: sumBy("audiobook"),
			libraryCount: libraries.length,
			memberCount: members[0]?.count ?? 0,
			authorCount: authors[0]?.count ?? 0,
			seriesCount: seriesRows[0]?.count ?? 0,
			collectionCount: collections[0]?.count ?? 0,
			storageKb: libraries.reduce((total, lib) => total + lib.storageKb, 0),
		};
	}
}

export const serverStatsRepository = new ServerStatsRepository();
