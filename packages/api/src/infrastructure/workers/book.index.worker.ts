import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { incrementCompleted, incrementFailed } from "../../modules/taskManager";
import { redis } from "../queue/redis";
import {
	fetchAllAuthorsForIndex,
	fetchAllSeriesForIndex,
	fetchAudiobooksForIndexBatch,
	fetchBooksForIndexBatch,
} from "../search/search.document";
import { getSearchProvider } from "../search/search.factory";

const log = logger.child({ component: "book-index-worker" });

const BATCH_SIZE = 1000;

async function reindexBooks(job: Job) {
	const searchProvider = getSearchProvider();

	if (!searchProvider.requiresSync()) {
		log.info("Search provider does not require sync, skipping reindex");
		return;
	}

	log.info({ jobName: job.name }, "Reindexing books");

	await searchProvider.initialize();

	// ── Ebooks ──────────────────────────────────────────────────
	const snapshotTime = new Date();
	let lastId: number | null = null;
	let processedCount = 0;
	const dbIdsSet = new Set<string>();

	while (true) {
		const books = await fetchBooksForIndexBatch({
			snapshotTime,
			lastId,
			limit: BATCH_SIZE,
		});

		if (books.length === 0) break;
		const firstBook = books[0];
		const lastBook = books.at(-1);

		log.info(
			{ count: books.length, firstId: firstBook?.id },
			"Fetched books from DB",
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
			log.error({ errors }, "Batch had indexing errors");
		}

		for (const b of books) {
			dbIdsSet.add(b.id as string);
		}
		if (!lastBook) {
			break;
		}
		lastId = lastBook.id as number;
		processedCount += indexed;
		log.info({ processedCount, lastId }, "Indexed books");
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
			log.info({ deleted }, "Cleaned up stale book documents");
		}
	} else {
		const deleted = await searchProvider.deleteByQuery({ match_all: {} });
		if (deleted > 0) {
			log.info({ deleted }, "Cleared all book documents (no ebooks in DB)");
		}
	}

	log.info({ processedCount }, "Book reindex complete");

	// ── Audiobooks ──────────────────────────────────────────────
	log.info("Reindexing audiobooks");
	let abLastId: number | null = null;
	let abProcessedCount = 0;
	const abDbIdsSet = new Set<string>();

	while (true) {
		const audiobooks = await fetchAudiobooksForIndexBatch({
			snapshotTime,
			lastId: abLastId,
			limit: BATCH_SIZE,
		});

		if (audiobooks.length === 0) break;
		const lastAudiobook = audiobooks.at(-1);

		const docs = audiobooks.map((doc: Record<string, unknown>) => ({
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

		const { indexed, errors } = await searchProvider.indexAudiobooksBulk(docs);
		if (errors > 0) {
			log.error({ errors }, "Audiobook batch had indexing errors");
		}

		for (const ab of audiobooks) {
			abDbIdsSet.add(ab.id as string);
		}
		if (!lastAudiobook) break;
		abLastId = lastAudiobook.id as number;
		abProcessedCount += indexed;
		log.info(
			{ processedCount: abProcessedCount, lastId: abLastId },
			"Indexed audiobooks",
		);
	}

	if (abDbIdsSet.size > 0) {
		const deleted = await searchProvider.deleteAudiobooksByQuery({
			bool: {
				must_not: [{ ids: { values: Array.from(abDbIdsSet) } }],
			},
		});
		if (deleted > 0) {
			log.info({ deleted }, "Cleaned up stale audiobook documents");
		}
	} else {
		const deleted = await searchProvider.deleteAudiobooksByQuery({
			match_all: {},
		});
		if (deleted > 0) {
			log.info({ deleted }, "Cleared all audiobook documents (none in DB)");
		}
	}

	log.info({ processedCount: abProcessedCount }, "Audiobook reindex complete");

	// ── Series ──────────────────────────────────────────────────
	log.info("Reindexing series");
	const allSeries = await fetchAllSeriesForIndex();
	if (allSeries.length > 0) {
		const { indexed: seriesIndexed, errors: seriesErrors } =
			await searchProvider.indexSeriesBulk(allSeries);
		log.info(
			{ indexed: seriesIndexed, errors: seriesErrors },
			"Series reindex",
		);
		// Cleanup stale series
		const seriesIds = allSeries.map((s) => String(s.id));
		const deletedSeries = await searchProvider.deleteSeriesByQuery({
			bool: { must_not: [{ ids: { values: seriesIds } }] },
		});
		if (deletedSeries > 0) {
			log.info({ deleted: deletedSeries }, "Cleaned up stale series documents");
		}
	} else {
		const deletedSeries = await searchProvider.deleteSeriesByQuery({
			match_all: {},
		});
		if (deletedSeries > 0) {
			log.info(
				{ deleted: deletedSeries },
				"Cleared all series documents (none in DB)",
			);
		}
	}

	// ── Authors ─────────────────────────────────────────────────
	log.info("Reindexing authors");
	const allAuthors = await fetchAllAuthorsForIndex();
	if (allAuthors.length > 0) {
		const { indexed: authorsIndexed, errors: authorsErrors } =
			await searchProvider.indexAuthorsBulk(allAuthors);
		log.info(
			{ indexed: authorsIndexed, errors: authorsErrors },
			"Authors reindex",
		);
		// Cleanup stale authors
		const authorIds = allAuthors.map((a) => String(a.id));
		const deletedAuthors = await searchProvider.deleteAuthorsByQuery({
			bool: { must_not: [{ ids: { values: authorIds } }] },
		});
		if (deletedAuthors > 0) {
			log.info(
				{ deleted: deletedAuthors },
				"Cleaned up stale author documents",
			);
		}
	} else {
		const deletedAuthors = await searchProvider.deleteAuthorsByQuery({
			match_all: {},
		});
		if (deletedAuthors > 0) {
			log.info(
				{ deleted: deletedAuthors },
				"Cleared all author documents (none in DB)",
			);
		}
	}
}

export const bookIndexWorker = new Worker("book-index", reindexBooks, {
	connection: redis,
	concurrency: 1,
});

bookIndexWorker.on("completed", async (job) => {
	log.info({ jobId: job?.id }, "Completed sync books job");
	const taskId = job?.data?.taskId as string | undefined;
	if (taskId) {
		await incrementCompleted(taskId).catch(() => {});
	}
});

bookIndexWorker.on("failed", async (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed sync books job");
	const taskId = job?.data?.taskId as string | undefined;
	if (taskId) {
		await incrementFailed(taskId).catch(() => {});
	}
});
