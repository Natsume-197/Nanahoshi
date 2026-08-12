import { db } from "@nanahoshi-v2/db";
import {
	audiobookAuthor,
	audiobookChapter,
	audiobookGenre,
	audiobookMetadata,
	audiobookSeries,
	audiobookTag,
	audioFile,
	author,
	book,
	bookNarrator,
	genre,
	library,
	narrator,
	publisher,
	series,
	tag,
} from "@nanahoshi-v2/db/schema/general";
import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	accessibleSql,
	type LibraryScope,
} from "../_shared/library-scope";
import { bookCreatedAtDesc } from "../books/book.repository";

export type AudiobookSeriesSort = "name" | "books" | "recent" | "random";

const AUDIOBOOK_SERIES_ORDER_BY: Record<AudiobookSeriesSort, SQL> = {
	name: sql`s.name ASC`,
	books: sql`"audiobookCount" DESC, s.name ASC`,
	recent: sql`s.created_at DESC NULLS LAST, s.name ASC`,
	random: sql`RANDOM()`,
};

interface AudiobookSeriesListOptions {
	limit?: number;
	offset?: number;
	sort?: AudiobookSeriesSort;
	query?: string;
}

type SeriesByNameRow = {
	uuid: string;
	filename: string;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
	duration: number | null;
	position: number | null;
};

type SeriesWithCountRow = {
	id: number;
	uuid: string;
	name: string;
	audiobookCount: number;
	coverInfo: { cover: string; color: string | null } | null;
	author: { id: number; uuid: string; name: string } | null;
};

type CountRow = { count: number };

export class AudiobookRepository {
	async getDetails(
		uuid: string,
		serverId?: string,
		scope: LibraryScope = "ALL",
	) {
		const conditions = [eq(book.uuid, uuid)];
		if (serverId) {
			conditions.push(eq(library.serverId, serverId));
		}
		const scopeCond = accessibleCondition(scope);
		if (scopeCond) conditions.push(scopeCond);

		const [row] = await db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				filesizeKb: book.filesizeKb,
				createdAt: book.createdAt,
				lastModified: book.lastModified,
				libraryId: book.libraryId,
				libraryUuid: library.uuid,
				libraryName: library.name,
				title: audiobookMetadata.title,
				subtitle: audiobookMetadata.subtitle,
				description: audiobookMetadata.description,
				publishedDate: audiobookMetadata.publishedDate,
				languageCode: audiobookMetadata.languageCode,
				isbn: audiobookMetadata.isbn,
				asin: audiobookMetadata.asin,
				cover: audiobookMetadata.cover,
				duration: audiobookMetadata.duration,
				codec: audiobookMetadata.codec,
				bitRate: audiobookMetadata.bitRate,
				channels: audiobookMetadata.channels,
				sampleRate: audiobookMetadata.sampleRate,
				explicit: audiobookMetadata.explicit,
				abridged: audiobookMetadata.abridged,
				mainColor: audiobookMetadata.mainColor,
				lockedFields: audiobookMetadata.lockedFields,
				publisherName: publisher.name,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.leftJoin(publisher, eq(publisher.id, audiobookMetadata.publisherId))
			.where(and(...conditions))
			.limit(1);

		if (!row) return null;

		const bookId = row.id;

		// Load audio files, chapters, authors, narrators, series, genres, tags in parallel
		const [audioFiles, chapters, authors, narrators, seriesInfo, genres, tags] =
			await Promise.all([
				db
					.select()
					.from(audioFile)
					.where(eq(audioFile.bookId, bookId))
					.orderBy(asc(audioFile.index)),
				db
					.select()
					.from(audiobookChapter)
					.where(eq(audiobookChapter.bookId, bookId))
					.orderBy(asc(audiobookChapter.index)),
				db
					.select({
						uuid: author.uuid,
						name: author.name,
						role: audiobookAuthor.role,
						provider: author.provider,
					})
					.from(audiobookAuthor)
					.innerJoin(author, eq(author.id, audiobookAuthor.authorId))
					.where(eq(audiobookAuthor.bookId, bookId)),
				db
					.select({
						uuid: narrator.uuid,
						name: narrator.name,
					})
					.from(bookNarrator)
					.innerJoin(narrator, eq(narrator.id, bookNarrator.narratorId))
					.where(eq(bookNarrator.bookId, bookId)),
				db
					.select({
						uuid: series.uuid,
						name: series.name,
						position: audiobookSeries.position,
					})
					.from(audiobookSeries)
					.innerJoin(series, eq(series.id, audiobookSeries.seriesId))
					.where(eq(audiobookSeries.bookId, bookId))
					.limit(1),
				db
					.select({ uuid: genre.uuid, name: genre.name })
					.from(audiobookGenre)
					.innerJoin(genre, eq(genre.id, audiobookGenre.genreId))
					.where(eq(audiobookGenre.bookId, bookId))
					.orderBy(asc(genre.name)),
				db
					.select({ uuid: tag.uuid, name: tag.name })
					.from(audiobookTag)
					.innerJoin(tag, eq(tag.id, audiobookTag.tagId))
					.where(eq(audiobookTag.bookId, bookId))
					.orderBy(asc(tag.name)),
			]);

		return {
			...row,
			lockedFields: row.lockedFields ?? [],
			audioFiles,
			chapters,
			authors,
			narrators,
			series: seriesInfo[0] ?? null,
			genres,
			tags,
		};
	}

	async listRecent(limit = 20, serverId?: string, scope: LibraryScope = "ALL") {
		const conditions = serverId ? [eq(library.serverId, serverId)] : [];

		const rows = await db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				filesizeKb: book.filesizeKb,
				createdAt: book.createdAt,
				title: audiobookMetadata.title,
				cover: audiobookMetadata.cover,
				mainColor: audiobookMetadata.mainColor,
				duration: audiobookMetadata.duration,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(
				and(
					eq(library.mediaType, "audiobook"),
					...conditions,
					accessibleCondition(scope),
				),
			)
			.orderBy(bookCreatedAtDesc)
			.limit(limit);

		const bookIds = rows.map((r) => r.id);
		const authorsMap =
			await batchLoaderRepository.loadAudiobookAuthors(bookIds);
		const narratorsMap = await batchLoaderRepository.loadNarrators(bookIds);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(row.id) ?? [],
			narrators: narratorsMap.get(row.id) ?? [],
		}));
	}

	async listRandom(limit = 15, serverId?: string, scope: LibraryScope = "ALL") {
		const conditions = serverId ? [eq(library.serverId, serverId)] : [];

		const rows = await db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				title: audiobookMetadata.title,
				cover: audiobookMetadata.cover,
				mainColor: audiobookMetadata.mainColor,
				duration: audiobookMetadata.duration,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(
				and(
					eq(library.mediaType, "audiobook"),
					isNull(book.duplicateOfBookId),
					...conditions,
					accessibleCondition(scope),
				),
			)
			.orderBy(sql`RANDOM()`)
			.limit(limit);

		const bookIds = rows.map((r) => r.id);
		const authorsMap =
			await batchLoaderRepository.loadAudiobookAuthors(bookIds);
		const narratorsMap = await batchLoaderRepository.loadNarrators(bookIds);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(row.id) ?? [],
			narrators: narratorsMap.get(row.id) ?? [],
		}));
	}

	async listPaginated(
		serverId: string,
		limit: number,
		offset: number,
		scope: LibraryScope = "ALL",
	) {
		const rows = await db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				createdAt: book.createdAt,
				title: audiobookMetadata.title,
				cover: audiobookMetadata.cover,
				duration: audiobookMetadata.duration,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(
				and(
					eq(library.serverId, serverId),
					eq(library.mediaType, "audiobook"),
					accessibleCondition(scope),
				),
			)
			.orderBy(bookCreatedAtDesc)
			.limit(limit)
			.offset(offset);

		const bookIds = rows.map((r) => r.id);
		const authorsMap =
			await batchLoaderRepository.loadAudiobookAuthors(bookIds);
		const narratorsMap = await batchLoaderRepository.loadNarrators(bookIds);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(row.id) ?? [],
			narrators: narratorsMap.get(row.id) ?? [],
		}));
	}

	async listAudioFiles(bookId: number) {
		return db
			.select({
				filename: audioFile.filename,
				path: audioFile.path,
				filesize: audioFile.filesize,
				mimeType: audioFile.mimeType,
			})
			.from(audioFile)
			.where(eq(audioFile.bookId, bookId))
			.orderBy(asc(audioFile.index));
	}

	async getAudioFile(
		bookUuid: string,
		fileIndex: number,
		serverId?: string,
		scope: LibraryScope = "ALL",
	) {
		const conditions = [
			eq(book.uuid, bookUuid),
			eq(audioFile.index, fileIndex),
		];
		if (serverId) {
			conditions.push(eq(library.serverId, serverId));
		}
		const scopeCond = accessibleCondition(scope);
		if (scopeCond) conditions.push(scopeCond);

		const [file] = await db
			.select({
				id: audioFile.id,
				bookId: audioFile.bookId,
				index: audioFile.index,
				filename: audioFile.filename,
				path: audioFile.path,
				duration: audioFile.duration,
				codec: audioFile.codec,
				bitRate: audioFile.bitRate,
				channels: audioFile.channels,
				sampleRate: audioFile.sampleRate,
				filesize: audioFile.filesize,
				format: audioFile.format,
				mimeType: audioFile.mimeType,
				discNumber: audioFile.discNumber,
				trackNumber: audioFile.trackNumber,
				createdAt: audioFile.createdAt,
			})
			.from(audioFile)
			.innerJoin(book, eq(book.id, audioFile.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(and(...conditions))
			.limit(1);

		return file ?? null;
	}

	async countByOrganization(
		serverId: string,
		scope: LibraryScope = "ALL",
	): Promise<number> {
		const [result] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(library.serverId, serverId),
					eq(library.mediaType, "audiobook"),
					accessibleCondition(scope),
				),
			);
		return result?.count ?? 0;
	}

	async listBySeriesUuid(
		seriesUuid: string,
		serverId?: string,
		scope: LibraryScope = "ALL",
	) {
		const result = await db.execute(sql`
			SELECT
				b.uuid, b.filename,
				am.title, am.cover, am.main_color AS "mainColor",
				am.duration,
				abs.position
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			INNER JOIN audiobook_metadata am ON am.book_id = b.id
			INNER JOIN audiobook_series abs ON abs.book_id = b.id
			INNER JOIN series s ON s.id = abs.series_id
			WHERE s.uuid = ${seriesUuid}
				AND l.media_type = 'audiobook'
				${serverId ? sql`AND l.server_id = ${serverId}` : sql``} ${accessibleSql(scope)}
			ORDER BY abs.position ASC NULLS LAST, am.title ASC
		`);

		const rows = result.rows as SeriesByNameRow[];
		return rows.map((row) => ({
			uuid: row.uuid,
			filename: row.filename,
			title: row.title ?? row.filename,
			cover: row.cover,
			mainColor: row.mainColor,
			duration: row.duration,
			position: row.position,
		}));
	}

	async listSeriesWithCount(
		serverId?: string,
		{
			limit = 30,
			offset = 0,
			sort = "name",
			query,
		}: AudiobookSeriesListOptions = {},
		scope: LibraryScope = "ALL",
	) {
		const orgCondition = serverId ? sql`AND l.server_id = ${serverId}` : sql``;
		const coverOrgCondition = serverId
			? sql`AND l2.server_id = ${serverId}`
			: sql``;
		const authorOrgCondition = serverId
			? sql`AND l3.server_id = ${serverId}`
			: sql``;
		// Library-access scope (aliases b for the main query, b2 for the cover subquery).
		const ids = scope === "ALL" ? null : scope;
		const scopeList = ids?.length
			? sql.join(
					ids.map((id) => sql`${id}`),
					sql`, `,
				)
			: null;
		const scopeCondition =
			ids === null
				? sql``
				: scopeList
					? sql`AND b.library_id IN (${scopeList})`
					: sql`AND false`;
		const coverScopeCondition =
			ids === null
				? sql``
				: scopeList
					? sql`AND b2.library_id IN (${scopeList})`
					: sql`AND false`;
		const authorScopeCondition =
			ids === null
				? sql``
				: scopeList
					? sql`AND b3.library_id IN (${scopeList})`
					: sql`AND false`;

		const selectClause = sql`
			SELECT
				s.id,
				s.uuid,
				s.name,
				COUNT(*)::int AS "audiobookCount",
				(
					SELECT jsonb_build_object('cover', am2.cover, 'color', am2.main_color)
					FROM audiobook_series abs2
					INNER JOIN book b2 ON b2.id = abs2.book_id
					INNER JOIN audiobook_metadata am2 ON am2.book_id = b2.id
					INNER JOIN library l2 ON l2.id = b2.library_id
					WHERE abs2.series_id = s.id
						AND am2.cover IS NOT NULL
						${coverOrgCondition} ${coverScopeCondition}
					ORDER BY abs2.position ASC NULLS LAST
					LIMIT 1
				) AS "coverInfo",
				(
					SELECT jsonb_build_object('id', a.id, 'uuid', a.uuid, 'name', a.name)
					FROM audiobook_series abs3
					INNER JOIN book b3 ON b3.id = abs3.book_id
					INNER JOIN library l3 ON l3.id = b3.library_id
					INNER JOIN audiobook_author aba ON aba.book_id = b3.id
					INNER JOIN author a ON a.id = aba.author_id
					WHERE abs3.series_id = s.id
						${authorOrgCondition} ${authorScopeCondition}
					GROUP BY a.id, a.name
					ORDER BY COUNT(*) DESC, a.name ASC
					LIMIT 1
				) AS author
			FROM series s
			INNER JOIN audiobook_series abs ON abs.series_id = s.id
			INNER JOIN book b ON b.id = abs.book_id
			INNER JOIN library l ON l.id = b.library_id
		`;
		const tail = (nameCondition: SQL) => sql`
			WHERE l.media_type = 'audiobook' ${orgCondition} ${scopeCondition} ${nameCondition}
			GROUP BY s.id
			HAVING COUNT(*) > 1
			ORDER BY ${query ? AUDIOBOOK_SERIES_ORDER_BY.name : AUDIOBOOK_SERIES_ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`;

		const trimmed = query?.trim();
		let rows: SeriesWithCountRow[];
		if (!trimmed) {
			rows = (await db.execute(sql`${selectClause} ${tail(sql``)}`))
				.rows as SeriesWithCountRow[];
		} else {
			// PGroonga full-text search (handles Japanese), with an ILIKE fallback
			// for substring matches — mirrors the ebook series search.
			rows = (
				await db.execute(
					sql`${selectClause} ${tail(sql`AND s.name &@~ ${trimmed}`)}`,
				)
			).rows as SeriesWithCountRow[];
			if (rows.length === 0) {
				rows = (
					await db.execute(
						sql`${selectClause} ${tail(sql`AND s.name ILIKE ${`%${trimmed}%`}`)}`,
					)
				).rows as SeriesWithCountRow[];
			}
		}

		return rows.map((row) => ({
			id: row.id,
			uuid: row.uuid,
			name: row.name,
			audiobookCount: row.audiobookCount,
			cover: row.coverInfo?.cover ?? null,
			coverColor: row.coverInfo?.color ?? null,
			author: row.author,
		}));
	}

	async countSeries(serverId?: string, scope: LibraryScope = "ALL") {
		const result = await db.execute(sql`
			SELECT COUNT(*)::int AS count FROM (
				SELECT s.id
				FROM series s
				INNER JOIN audiobook_series abs ON abs.series_id = s.id
				INNER JOIN book b ON b.id = abs.book_id
				INNER JOIN library l ON l.id = b.library_id
				WHERE l.media_type = 'audiobook'
					${serverId ? sql`AND l.server_id = ${serverId}` : sql``} ${accessibleSql(scope)}
				GROUP BY s.id
				HAVING COUNT(*) > 1
			) t
		`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const audiobookRepository = new AudiobookRepository();
