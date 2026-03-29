import { db } from "@nanahoshi-v2/db";
import {
	audiobookAuthor,
	audiobookChapter,
	audiobookMetadata,
	audiobookSeries,
	audioFile,
	author,
	book,
	bookNarrator,
	library,
	narrator,
	series,
} from "@nanahoshi-v2/db/schema/general";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
	batchLoadAudiobookAuthors,
	batchLoadNarrators,
} from "../_shared/batch-loaders";

export class AudiobookRepository {
	async getDetails(uuid: string, organizationId?: string) {
		const conditions = [eq(book.uuid, uuid)];
		if (organizationId) {
			conditions.push(eq(library.organizationId, organizationId));
		}

		const [row] = await db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				filesizeKb: book.filesizeKb,
				createdAt: book.createdAt,
				lastModified: book.lastModified,
				libraryId: book.libraryId,
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
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(and(...conditions))
			.limit(1);

		if (!row) return null;

		const bookId = row.id;

		// Load audio files, chapters, authors, narrators, series in parallel
		const [audioFiles, chapters, authors, narrators, seriesInfo] =
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
						id: author.id,
						name: author.name,
						role: audiobookAuthor.role,
						provider: author.provider,
					})
					.from(audiobookAuthor)
					.innerJoin(author, eq(author.id, audiobookAuthor.authorId))
					.where(eq(audiobookAuthor.bookId, bookId)),
				db
					.select({
						id: narrator.id,
						name: narrator.name,
					})
					.from(bookNarrator)
					.innerJoin(narrator, eq(narrator.id, bookNarrator.narratorId))
					.where(eq(bookNarrator.bookId, bookId)),
				db
					.select({
						id: series.id,
						name: series.name,
						position: audiobookSeries.position,
					})
					.from(audiobookSeries)
					.innerJoin(series, eq(series.id, audiobookSeries.seriesId))
					.where(eq(audiobookSeries.bookId, bookId))
					.limit(1),
			]);

		return {
			...row,
			audioFiles,
			chapters,
			authors,
			narrators,
			series: seriesInfo[0] ?? null,
		};
	}

	async listRecent(limit = 20, organizationId?: string) {
		const conditions = organizationId
			? [eq(library.organizationId, organizationId)]
			: [];

		const rows = await db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				filesizeKb: book.filesizeKb,
				createdAt: book.createdAt,
				title: audiobookMetadata.title,
				cover: audiobookMetadata.cover,
				duration: audiobookMetadata.duration,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(and(eq(library.mediaType, "audiobook"), ...conditions))
			.orderBy(desc(book.createdAt))
			.limit(limit);

		const bookIds = rows.map((r) => r.id);
		const authorsMap = await batchLoadAudiobookAuthors(bookIds);
		const narratorsMap = await batchLoadNarrators(bookIds);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(row.id) ?? [],
			narrators: narratorsMap.get(row.id) ?? [],
		}));
	}

	async listPaginated(organizationId: string, limit: number, offset: number) {
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
					eq(library.organizationId, organizationId),
					eq(library.mediaType, "audiobook"),
				),
			)
			.orderBy(desc(book.createdAt))
			.limit(limit)
			.offset(offset);

		const bookIds = rows.map((r) => r.id);
		const authorsMap = await batchLoadAudiobookAuthors(bookIds);
		const narratorsMap = await batchLoadNarrators(bookIds);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(row.id) ?? [],
			narrators: narratorsMap.get(row.id) ?? [],
		}));
	}

	async getAudioFile(
		bookUuid: string,
		fileIndex: number,
		organizationId?: string,
	) {
		const conditions = [
			eq(book.uuid, bookUuid),
			eq(audioFile.index, fileIndex),
		];
		if (organizationId) {
			conditions.push(eq(library.organizationId, organizationId));
		}

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

	async countByOrganization(organizationId: string): Promise<number> {
		const [result] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(library.organizationId, organizationId),
					eq(library.mediaType, "audiobook"),
				),
			);
		return result?.count ?? 0;
	}

	async listBySeriesName(seriesName: string, organizationId?: string) {
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
			WHERE s.name = ${seriesName}
				AND l.media_type = 'audiobook'
				${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``}
			ORDER BY abs.position ASC NULLS LAST, am.title ASC
		`);

		return result.rows.map((row) => ({
			uuid: row.uuid as string,
			filename: row.filename as string,
			title: (row.title as string | null) ?? (row.filename as string),
			cover: row.cover as string | null,
			mainColor: row.mainColor as string | null,
			duration: row.duration as number | null,
			position: row.position as number | null,
		}));
	}

	async listSeriesWithCount(organizationId?: string, limit = 30, offset = 0) {
		const result = await db.execute(sql`
			SELECT
				s.id,
				s.name,
				COUNT(DISTINCT b.id)::int AS "audiobookCount",
				(
					SELECT am2.cover
					FROM audiobook_series abs2
					INNER JOIN book b2 ON b2.id = abs2.book_id
					INNER JOIN audiobook_metadata am2 ON am2.book_id = b2.id
					INNER JOIN library l2 ON l2.id = b2.library_id
					WHERE abs2.series_id = s.id
						AND am2.cover IS NOT NULL
						${organizationId ? sql`AND l2.organization_id = ${organizationId}` : sql``}
					ORDER BY abs2.position ASC NULLS LAST
					LIMIT 1
				) AS cover
			FROM series s
			INNER JOIN audiobook_series abs ON abs.series_id = s.id
			INNER JOIN book b ON b.id = abs.book_id
			INNER JOIN library l ON l.id = b.library_id
			WHERE l.media_type = 'audiobook'
				${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``}
			GROUP BY s.id
			HAVING COUNT(DISTINCT b.id) > 1
			ORDER BY s.name ASC
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		return result.rows.map((row) => ({
			id: row.id as number,
			name: row.name as string,
			audiobookCount: row.audiobookCount as number,
			cover: row.cover as string | null,
		}));
	}
}

export const audiobookRepository = new AudiobookRepository();
