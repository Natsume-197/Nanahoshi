import os from "node:os";
import { db } from "@nanahoshi-v2/db";
import { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { type Job, Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import {
	incrementCompleted,
	incrementFailed,
	isTaskCancelled,
} from "../../modules/taskManager";
import { bookRepository } from "../../routers/books/book.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { generateDeterministicUUID } from "../../utils/misc";
import { redis } from "../queue/redis";
import { deleteBook, indexBook } from "../search/elasticsearch/search.client";

async function fetchBookForIndex(
	bookId: number,
): Promise<Record<string, unknown> | null> {
	const { rows } = await db.execute(sql`
		SELECT
			b.id::text AS id,
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
			jsonb_build_object('name', p.name) AS publisher,
			jsonb_build_object('name', s.name) AS series,
			COALESCE(
				jsonb_agg(
					DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', ba.role)
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
		WHERE b.id = ${bookId}
		GROUP BY b.id, bm.book_id, p.id, s.id, l.organization_id
	`);
	if (rows.length === 0) return null;
	const doc = rows[0] as Record<string, unknown> | undefined;
	if (!doc) {
		return null;
	}
	return {
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
			(doc.series as Record<string, unknown>)?.name != null ? doc.series : null,
	};
}

// Prepared statement for updating file status to 'done', scoped by path and libraryPathId
const updateStatusDone = db
	.update(scannedFile)
	.set({
		status: "done",
		updatedAt: new Date(),
	})
	.where(
		and(
			eq(scannedFile.path, sql.placeholder("path")),
			eq(scannedFile.libraryPathId, sql.placeholder("libraryPathId")),
		),
	)
	.prepare("update_status_done");

const numCPUs = os.cpus().length;
const CONCURRENCY =
	Number(process.env.WORKER_CONCURRENCY) || Math.max(2, numCPUs * 2);

const LIMITER_MAX = Math.min(CONCURRENCY * 2, 100);
const LIMITER_DURATION = 1000;

console.log(
	`[Worker] Starting with concurrency=${CONCURRENCY} (CPUs=${numCPUs})`,
);

export const fileEventWorker = new Worker(
	"file-events",
	async (job) => {
		const {
			action,
			filename,
			fileHash,
			path,
			lastModified,
			size,
			relativePath,
			libraryId,
			libraryPathId,
			taskId,
		} = job.data;

		try {
			if (taskId && (await isTaskCancelled(taskId))) {
				return { path, action, skipped: "cancelled" };
			}
			if (action === "add") {
				const bookInserted = await bookRepository.create({
					uuid: generateDeterministicUUID(filename, fileHash),
					filename: filename,
					filehash: fileHash,
					libraryId: libraryId,
					libraryPathId: libraryPathId,
					relativePath: relativePath,
					filesizeKb: Math.round(size / 1024),
					lastModified: lastModified,
				});

				if (bookInserted) {
					await bookMetadataService.enrichAndSaveMetadata({
						bookId: bookInserted.id,
						uuid: bookInserted.uuid,
					});

					// Index the new book in ES
					const esDoc = await fetchBookForIndex(bookInserted.id);
					if (esDoc) {
						await indexBook(esDoc).catch((err) =>
							console.error(
								`[Worker] ES index failed for book ${bookInserted.id}:`,
								err,
							),
						);
					}
				}

				await updateStatusDone.execute({ path, libraryPathId });
			} else if (action === "delete") {
				// Get the book before deleting so we can remove it from ES
				const existing = await bookRepository.getByRelativePath(
					relativePath,
					libraryPathId,
				);
				await bookRepository.removeBookByRelativePath(
					relativePath,
					libraryPathId,
				);
				if (existing) {
					await deleteBook(String(existing.id)).catch((err) =>
						console.error(
							`[Worker] ES delete failed for book ${existing.id}:`,
							err,
						),
					);
				}
			}

			return { path, action };
		} catch (err) {
			console.error(`[Worker] Failed job ${job.id} path=${path}`, err);
			throw err;
		}
	},
	{
		connection: redis,
		concurrency: CONCURRENCY,
		limiter: {
			max: LIMITER_MAX,
			duration: LIMITER_DURATION,
		},
	},
);

let processedCount = 0;
fileEventWorker.on("completed", (job: Job) => {
	processedCount++;
	if (processedCount % 1000 === 0) {
		console.log(`[Worker] Completed ${processedCount} jobs`);
	}
	if (job.data?.taskId) {
		incrementCompleted(job.data.taskId).catch(() => {});
	}
});

fileEventWorker.on("failed", (job, err) => {
	console.error(`[Worker] Failed job ${job?.id}`, err);
	if (job?.data?.taskId) {
		incrementFailed(job.data.taskId).catch(() => {});
	}
});
