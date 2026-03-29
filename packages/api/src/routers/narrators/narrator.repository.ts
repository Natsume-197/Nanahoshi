import { db } from "@nanahoshi-v2/db";
import { sql } from "drizzle-orm";

export class NarratorRepository {
	async listWithAudiobookCount(
		organizationId?: string,
		limit = 30,
		offset = 0,
	) {
		const result = await db.execute(sql`
			SELECT
				n.id,
				n.name,
				COUNT(DISTINCT b.id)::int AS "audiobookCount"
			FROM narrator n
			INNER JOIN book_narrator bn ON bn.narrator_id = n.id
			INNER JOIN book b ON b.id = bn.book_id
			INNER JOIN library l ON l.id = b.library_id
			${organizationId ? sql`WHERE l.organization_id = ${organizationId}` : sql``}
			GROUP BY n.id
			ORDER BY n.name ASC
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		return result.rows.map((row) => ({
			id: row.id as number,
			name: row.name as string,
			audiobookCount: row.audiobookCount as number,
		}));
	}
}

export const narratorRepository = new NarratorRepository();
