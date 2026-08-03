import { db } from "@nanahoshi-v2/db";
import { sql } from "drizzle-orm";

type RelatedEntitiesRow = {
	seriesIds: number[] | null;
	authorIds: number[] | null;
};

export async function fetchBookRelatedEntities(
	bookId: number,
): Promise<{ seriesIds: number[]; authorIds: number[] }> {
	const result = await db.execute(sql`
		SELECT
			COALESCE(
				(SELECT array_agg(DISTINCT bs.series_id) FROM book_series bs WHERE bs.book_id = ${bookId}),
				'{}'
			) AS "seriesIds",
			COALESCE(
				(SELECT array_agg(DISTINCT x.author_id) FROM (
					SELECT ba.author_id FROM book_author ba WHERE ba.book_id = ${bookId}
					UNION ALL
					SELECT aa.author_id FROM audiobook_author aa WHERE aa.book_id = ${bookId}
				) x),
				'{}'
			) AS "authorIds"
	`);
	const row = (result.rows as RelatedEntitiesRow[])[0];
	return {
		seriesIds: row?.seriesIds ?? [],
		authorIds: row?.authorIds ?? [],
	};
}

async function fetchRelatedEntitiesByBookFilter(
	filter: ReturnType<typeof sql>,
): Promise<{ seriesIds: number[]; authorIds: number[] }> {
	const result = await db.execute(sql`
		SELECT
			COALESCE(
				(SELECT array_agg(DISTINCT bs.series_id)
				 FROM book_series bs
				 INNER JOIN book b ON b.id = bs.book_id
				 WHERE ${filter}),
				'{}'
			) AS "seriesIds",
			COALESCE(
				(SELECT array_agg(DISTINCT x.author_id) FROM (
					SELECT ba.author_id FROM book_author ba
					INNER JOIN book b ON b.id = ba.book_id WHERE ${filter}
					UNION ALL
					SELECT aa.author_id FROM audiobook_author aa
					INNER JOIN book b ON b.id = aa.book_id WHERE ${filter}
				) x),
				'{}'
			) AS "authorIds"
	`);
	const row = (result.rows as RelatedEntitiesRow[])[0];
	return {
		seriesIds: row?.seriesIds ?? [],
		authorIds: row?.authorIds ?? [],
	};
}

export function fetchRelatedEntitiesByLibraryId(libraryId: number) {
	return fetchRelatedEntitiesByBookFilter(sql`b.library_id = ${libraryId}`);
}

export function fetchRelatedEntitiesByLibraryPathId(pathId: number) {
	return fetchRelatedEntitiesByBookFilter(sql`b.library_path_id = ${pathId}`);
}
