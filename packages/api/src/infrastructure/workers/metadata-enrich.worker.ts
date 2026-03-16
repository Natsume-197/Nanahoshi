import { db } from "@nanahoshi-v2/db";
import { book } from "@nanahoshi-v2/db/schema/general";
import { type Job, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import {
	incrementCompleted,
	incrementFailed,
	incrementTotalJobs,
	isTaskCancelled,
} from "../../modules/taskManager";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { buildEnrichInput } from "../../routers/books/metadata/metadata.utils";
import { enqueueSearchSync } from "../search/search-sync.service";
import { redis } from "../queue/redis";

const BATCH_SIZE = 20;

async function enrichAllBooks(job: Job<{ taskId?: string }>) {
	const { taskId } = job.data;

	console.log("[Worker] Starting metadata enrichment for all books...");

	const countResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(book);
	const totalBooks = countResult[0]?.count ?? 0;

	if (taskId) {
		await incrementTotalJobs(taskId, totalBooks);
	}

	let lastId: number | null = null;
	let processed = 0;
	let enriched = 0;

	while (true) {
		if (taskId && (await isTaskCancelled(taskId))) {
			console.log("[Worker] Metadata enrichment cancelled");
			break;
		}

		const { rows: books } = await db.execute(sql`
			SELECT
				b.id,
				b.uuid,
				bm.title,
				bm.subtitle,
				bm.description,
				bm.isbn_10 AS "isbn10",
				bm.isbn_13 AS "isbn13",
				bm.asin,
				bm.language_code AS "languageCode",
				bm.cover,
				jsonb_build_object('name', p.name) AS publisher,
				COALESCE(
					jsonb_agg(
						DISTINCT jsonb_build_object('name', a.name, 'role', ba.role)
					) FILTER (WHERE a.id IS NOT NULL),
					'[]'
				) AS authors
			FROM book b
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN book_author ba ON ba.book_id = b.id
			LEFT JOIN author a ON a.id = ba.author_id
			LEFT JOIN publisher p ON p.id = bm.publisher_id
			${lastId ? sql`WHERE b.id > ${lastId}` : sql``}
			GROUP BY b.id, bm.book_id, p.id
			ORDER BY b.id ASC
			LIMIT ${BATCH_SIZE}
		`);

		if (books.length === 0) break;

		for (const row of books) {
			if (taskId && (await isTaskCancelled(taskId))) break;

			const bookId = row.id as number;
			const uuid = row.uuid as string;

			try {
				const input = buildEnrichInput(bookId, uuid, row);
				const result = await bookMetadataService.enrichFromAmazon(
					input,
					{ skipSearchSync: true },
				);

				if (result) {
					enriched++;
					// Enqueue individual search sync for enriched books only
					await enqueueSearchSync(bookId, "update");
				}
				if (taskId) await incrementCompleted(taskId);
			} catch (error) {
				console.warn(
					`[Worker] Failed to enrich book ${uuid}:`,
					error,
				);
				if (taskId) await incrementFailed(taskId);
			}

			processed++;
		}

		lastId = books.at(-1)?.id as number;
		await job.updateProgress(processed);
		console.log(
			`[Worker] Enrichment progress: ${processed}/${totalBooks} (${enriched} enriched)`,
		);
	}

	console.log(
		`[Worker] Metadata enrichment complete: ${processed} processed, ${enriched} enriched`,
	);
}

export const metadataEnrichWorker = new Worker(
	"metadata-enrich",
	enrichAllBooks,
	{
		connection: redis,
		concurrency: 1,
	},
);

metadataEnrichWorker.on("completed", (job) => {
	console.log(`[Worker] Completed metadata enrichment job ${job?.id}`);
});

metadataEnrichWorker.on("failed", (job, err) => {
	console.error(`[Worker] Failed metadata enrichment job ${job?.id}`, err);
});
