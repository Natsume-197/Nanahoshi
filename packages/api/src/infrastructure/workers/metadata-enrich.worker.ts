import { db } from "@nanahoshi-v2/db";
import { book } from "@nanahoshi-v2/db/schema/general";
import { type Job, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import { regroupBookDuplicates } from "../../modules/duplicateGrouping";
import {
	finalizeTask,
	incrementCompleted,
	incrementFailed,
	incrementTotalJobs,
	isTaskCancelled,
	maybeFinalizeAutoEnrichTask,
} from "../../modules/taskManager";
import { audiobookMetadataRepository } from "../../routers/audiobooks/metadata/metadata.repository";
import { audiobookMetadataService } from "../../routers/audiobooks/metadata/metadata.service";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { buildEnrichInput } from "../../routers/books/metadata/metadata.utils";
import { redis } from "../queue/redis";

const BATCH_SIZE = 20;

async function enrichSingleBook(
	job: Job<{ bookId: number; uuid: string; taskId?: string }>,
) {
	const { bookId, uuid, taskId } = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		// Skip if already enriched from Amazon
		const alreadyEnriched =
			await bookMetadataRepository.isAmazonEnriched(bookId);
		if (alreadyEnriched) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		const { rows } = await db.execute(sql`
			SELECT
				b.id,
				b.uuid,
				b.duplicate_of_book_id AS "duplicateOfBookId",
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
			WHERE b.id = ${bookId}
			GROUP BY b.id, bm.book_id, p.id
		`);

		if (rows.length === 0) {
			console.warn(`[Worker] Book ${bookId} not found for enrichment`);
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		const row = rows[0] as Record<string, unknown>;

		// One source of truth: hidden copies aren't enriched. Only the canonical
		// is shown, so enriching duplicates would waste calls and let metadata
		// diverge between copies.
		if (row.duplicateOfBookId != null) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}
		const input = buildEnrichInput(
			bookId,
			uuid,
			row as Record<string, unknown>,
		);
		const result = await bookMetadataService.enrichFromAmazon(input);

		// Amazon may have just added an ISBN/ASIN — re-evaluate grouping.
		await regroupBookDuplicates(bookId).catch((err) =>
			console.error(`[Worker] Regroup failed for book ${bookId}:`, err),
		);

		if (taskId) await incrementCompleted(taskId);
		console.log(
			`[Worker] Enriched book ${uuid}: ${result ? "updated" : "no changes"}`,
		);
	} catch (error) {
		const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade;
		console.warn(
			`[Worker] Failed to enrich book ${uuid} (${attemptsLeft > 0 ? `${attemptsLeft} retries left` : "no retries left"}):`,
			error,
		);
		// Only count as failed on the final attempt
		if (attemptsLeft <= 0 && taskId) {
			await incrementFailed(taskId);
		}
		throw error;
	}
}

async function enrichSingleAudiobook(
	job: Job<{ bookId: number; uuid: string; taskId?: string }>,
) {
	const { bookId, uuid, taskId } = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		// Skip if already enriched from Audible
		const alreadyEnriched =
			await audiobookMetadataRepository.isAudibleEnriched(bookId);
		if (alreadyEnriched) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		// Fetch audiobook metadata + authors from the DB
		const { rows } = await db.execute(sql`
			SELECT
				am.title,
				COALESCE(
					jsonb_agg(
						DISTINCT jsonb_build_object('name', a.name)
					) FILTER (WHERE a.id IS NOT NULL),
					'[]'
				) AS authors
			FROM audiobook_metadata am
			LEFT JOIN audiobook_author aa ON aa.book_id = am.book_id
			LEFT JOIN author a ON a.id = aa.author_id
			WHERE am.book_id = ${bookId}
			GROUP BY am.book_id
		`);

		const row = rows[0];
		const title = row?.title as string | null;

		if (!title) {
			console.warn(
				`[Worker] Audiobook ${uuid} has no title, skipping enrichment`,
			);
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		const authors = (row?.authors ?? []) as { name: string }[];

		const result = await audiobookMetadataService.quickMatch({
			bookId,
			uuid,
			title,
			authors: authors.length > 0 ? authors : undefined,
		});

		if (taskId) await incrementCompleted(taskId);
		console.log(
			`[Worker] Enriched audiobook ${uuid}: ${result ? "matched" : "no match"}`,
		);
	} catch (error) {
		const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade;
		console.warn(
			`[Worker] Failed to enrich audiobook ${uuid} (${attemptsLeft > 0 ? `${attemptsLeft} retries left` : "no retries left"}):`,
			error,
		);
		if (attemptsLeft <= 0 && taskId) {
			await incrementFailed(taskId);
		}
		throw error;
	}
}

async function enrichAllBooks(job: Job<{ taskId?: string }>) {
	const { taskId } = job.data;

	console.log("[Worker] Starting metadata enrichment for all books...");

	const countResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(book);
	const totalBooks = countResult[0]?.count ?? 0;

	if (taskId) {
		await incrementTotalJobs(taskId, totalBooks);
		// Total is final from here on: the counters can now finish the task
		await finalizeTask(taskId);
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
				const result = await bookMetadataService.enrichFromAmazon(input);

				if (result) {
					enriched++;
				}
				if (taskId) await incrementCompleted(taskId);
			} catch (error) {
				console.warn(`[Worker] Failed to enrich book ${uuid}:`, error);
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
	async (job) => {
		if (job.name === "enrich-book") {
			return enrichSingleBook(job);
		}
		if (job.name === "enrich-audiobook") {
			return enrichSingleAudiobook(job);
		}
		return enrichAllBooks(job);
	},
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

// Backstop: if a scan was cancelled mid-flight, in-flight file events may
// have unsealed the auto-enrich task after the scan already finished. Once
// the queue drains with no scan running, seal it so it can complete.
metadataEnrichWorker.on("drained", () => {
	maybeFinalizeAutoEnrichTask().catch(() => {});
});
