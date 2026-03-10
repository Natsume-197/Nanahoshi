import { db } from "@nanahoshi-v2/db";
import { type Job, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import { redis } from "../queue/redis";
import {
	deleteByQuery,
	ensureIndex,
	esClient,
	INDEX_NAME,
	indexBooksBulk,
} from "../search/elasticsearch/search.client";

const BATCH_SIZE = 1000;

async function reindexBooks(job: Job) {
	console.log(`[Worker] Reindexing books... Job: ${job.name}`);

	await ensureIndex();

	const snapshotTime = new Date();
	let lastId: number | null = null;
	let processedCount = 0;
	const dbIdsSet = new Set<string>();

	while (true) {
		const { rows: books } = await db.execute(sql`
			SELECT
				b.id::text,
				b.filename,
				b.filesize_kb AS "filesizeKb",
				b.uuid,
				l.organization_id AS "organizationId",
				b.created_at AS "createdAt",
				b.last_modified AS "lastModified",
				bm.title,
				bm.title_romaji AS "titleRomaji",
				bm.subtitle,
				bm.description,
				bm.published_date AS "publishedDate",
				bm.language_code AS "languageCode",
				bm.page_count AS "pageCount",
				bm.isbn_10 AS "isbn10",
				bm.isbn_13 AS "isbn13",
				bm.asin,
				bm.cover,
				bm.amount_chars AS "amountChars",
				jsonb_build_object('name', p.name) AS publisher,
				jsonb_build_object('name', s.name) AS series,
				COALESCE(
					jsonb_agg(
						DISTINCT jsonb_build_object(
							'id', a.id,
							'name', a.name,
							'role', ba.role
						)
					) FILTER (WHERE a.id IS NOT NULL),
					'[]'
				) AS authors
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN publisher p ON p.id = bm.publisher_id
			LEFT JOIN series s ON s.id = bm.series_id
			LEFT JOIN book_author ba ON ba.book_id = b.id
			LEFT JOIN author a ON a.id = ba.author_id
			WHERE b.created_at <= ${snapshotTime}
			${lastId ? sql`AND b.id > ${Number(lastId)}` : sql``}
			GROUP BY b.id, bm.book_id, p.id, s.id, l.organization_id
			ORDER BY b.id ASC
			LIMIT ${BATCH_SIZE}
		`);

		if (books.length === 0) break;
		const firstBook = books[0];
		const lastBook = books.at(-1);

		console.log(
			`[Worker] Fetched ${books.length} books from DB, first id=${firstBook?.id}`,
		);

		const docs = books.map((doc: Record<string, unknown>) => ({
			...doc,
			createdAt: doc.createdAt
				? new Date(doc.createdAt as string).toISOString()
				: null,
			lastModified: doc.lastModified
				? new Date(doc.lastModified as string).toISOString()
				: null,
			// Clean up null-name objects from LEFT JOINs
			publisher:
				(doc.publisher as Record<string, unknown>)?.name != null
					? doc.publisher
					: null,
			series:
				(doc.series as Record<string, unknown>)?.name != null
					? doc.series
					: null,
		}));

		const { indexed, errors } = await indexBooksBulk(docs);
		if (errors > 0) {
			console.error(`[Worker] Batch had ${errors} indexing errors`);
		}

		for (const b of books) {
			dbIdsSet.add(b.id as string);
		}
		if (!lastBook) {
			break;
		}
		lastId = lastBook.id as number;
		processedCount += indexed;
		console.log(`[Worker] Indexed ${processedCount} books (lastId=${lastId})`);
		await job.updateProgress(processedCount);
	}

	// Refresh index after all batches
	await esClient.indices.refresh({ index: INDEX_NAME });

	// Cleanup: delete ES docs that are no longer in the DB
	if (dbIdsSet.size > 0) {
		const deleted = await deleteByQuery({
			bool: {
				must_not: [{ ids: { values: Array.from(dbIdsSet) } }],
			},
		});
		if (deleted > 0) {
			console.log(`[Worker] Cleaned up ${deleted} stale ES documents`);
		}
	}

	console.log(`[Worker] Reindex complete: ${processedCount} books indexed`);
}

export const bookIndexWorker = new Worker("book-index", reindexBooks, {
	connection: redis,
	concurrency: 1,
});

bookIndexWorker.on("completed", (job) => {
	console.log(`[Worker] Completed sync books job ${job?.id}`);
});

bookIndexWorker.on("failed", (job, err) => {
	console.error(`[Worker] Failed sync books job ${job?.id}`, err);
});
