import { db } from "@nanahoshi-v2/db";
import { type Job, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import { incrementCompleted, incrementFailed } from "../../modules/taskManager";
import { redis } from "../queue/redis";
import {
	fetchAllAuthorsForIndex,
	fetchAllSeriesForIndex,
} from "../search/search.document";
import { getSearchProvider } from "../search/search.factory";

const BATCH_SIZE = 1000;

async function reindexBooks(job: Job) {
	const searchProvider = getSearchProvider();

	if (!searchProvider.requiresSync()) {
		console.log(
			"[Worker] Search provider does not require sync, skipping reindex",
		);
		return;
	}

	console.log(`[Worker] Reindexing books... Job: ${job.name}`);

	await searchProvider.initialize();

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
			publisher:
				(doc.publisher as Record<string, unknown>)?.name != null
					? doc.publisher
					: null,
			series:
				(doc.series as Record<string, unknown>)?.name != null
					? doc.series
					: null,
		}));

		const { indexed, errors } = await searchProvider.indexBooksBulk(docs);
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

	// Cleanup: delete ES docs that no longer exist in the DB
	if (dbIdsSet.size > 0) {
		const deleted = await searchProvider.deleteByQuery({
			bool: {
				must_not: [{ ids: { values: Array.from(dbIdsSet) } }],
			},
		});
		if (deleted > 0) {
			console.log(`[Worker] Cleaned up ${deleted} stale search documents`);
		}
	} else {
		// No books in DB — wipe the entire index
		const deleted = await searchProvider.deleteByQuery({ match_all: {} });
		if (deleted > 0) {
			console.log(
				`[Worker] Cleared all ${deleted} search documents (no books in DB)`,
			);
		}
	}

	console.log(`[Worker] Reindex complete: ${processedCount} books indexed`);

	// Reindex series
	console.log("[Worker] Reindexing series...");
	const allSeries = await fetchAllSeriesForIndex();
	if (allSeries.length > 0) {
		const { indexed: seriesIndexed, errors: seriesErrors } =
			await searchProvider.indexSeriesBulk(allSeries);
		console.log(
			`[Worker] Series reindex: ${seriesIndexed} indexed, ${seriesErrors} errors`,
		);
		// Cleanup stale series
		const seriesIds = allSeries.map((s) => String(s.id));
		const deletedSeries = await searchProvider.deleteSeriesByQuery({
			bool: { must_not: [{ ids: { values: seriesIds } }] },
		});
		if (deletedSeries > 0) {
			console.log(
				`[Worker] Cleaned up ${deletedSeries} stale series documents`,
			);
		}
	} else {
		const deletedSeries = await searchProvider.deleteSeriesByQuery({
			match_all: {},
		});
		if (deletedSeries > 0) {
			console.log(
				`[Worker] Cleared all ${deletedSeries} series documents (none in DB)`,
			);
		}
	}

	// Reindex authors
	console.log("[Worker] Reindexing authors...");
	const allAuthors = await fetchAllAuthorsForIndex();
	if (allAuthors.length > 0) {
		const { indexed: authorsIndexed, errors: authorsErrors } =
			await searchProvider.indexAuthorsBulk(allAuthors);
		console.log(
			`[Worker] Authors reindex: ${authorsIndexed} indexed, ${authorsErrors} errors`,
		);
		// Cleanup stale authors
		const authorIds = allAuthors.map((a) => String(a.id));
		const deletedAuthors = await searchProvider.deleteAuthorsByQuery({
			bool: { must_not: [{ ids: { values: authorIds } }] },
		});
		if (deletedAuthors > 0) {
			console.log(
				`[Worker] Cleaned up ${deletedAuthors} stale author documents`,
			);
		}
	} else {
		const deletedAuthors = await searchProvider.deleteAuthorsByQuery({
			match_all: {},
		});
		if (deletedAuthors > 0) {
			console.log(
				`[Worker] Cleared all ${deletedAuthors} author documents (none in DB)`,
			);
		}
	}
}

export const bookIndexWorker = new Worker("book-index", reindexBooks, {
	connection: redis,
	concurrency: 1,
});

bookIndexWorker.on("completed", async (job) => {
	console.log(`[Worker] Completed sync books job ${job?.id}`);
	const taskId = job?.data?.taskId as string | undefined;
	if (taskId) {
		await incrementCompleted(taskId).catch(() => {});
	}
});

bookIndexWorker.on("failed", async (job, err) => {
	console.error(`[Worker] Failed sync books job ${job?.id}`, err);
	const taskId = job?.data?.taskId as string | undefined;
	if (taskId) {
		await incrementFailed(taskId).catch(() => {});
	}
});
