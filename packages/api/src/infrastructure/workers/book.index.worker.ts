import { type Job, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import { db } from "@nanahoshi-v2/db";
import { redis } from "../queue/redis";
import { getBooksIndex } from "../search/meilisearch/search.client";

const BATCH_SIZE = 1000;
async function reindexBooks(job: Job) {
    console.log(`[Worker] Reindexing books... Job: ${job.name}`);
    
    const snapshotTime = new Date();
    const booksIndex = await getBooksIndex();
    let lastId: number | null = null;
    let processedCount = 0;
    const dbIdsSet = new Set<number>();

    while (true) {
        const { rows: books } = await db.execute(sql`
            SELECT
                b.id,
                b.filename,
                b.filesize_kb AS "filesizeKb",
                b.uuid,
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
                COALESCE(
                    jsonb_agg(
                        DISTINCT jsonb_build_object(
                            'name', a.name,
                            'role', ba.role
                        )
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'
                ) AS authors
            FROM book b
            LEFT JOIN book_metadata bm ON bm.book_id = b.id
            LEFT JOIN publisher p ON p.id = bm.publisher_id
            LEFT JOIN book_author ba ON ba.book_id = b.id
            LEFT JOIN author a ON a.id = ba.author_id
            WHERE b.created_at <= ${snapshotTime}
            ${lastId ? sql`AND b.id > ${lastId}` : sql``}
            GROUP BY b.id, bm.book_id, p.id
            ORDER BY b.id ASC
            LIMIT ${BATCH_SIZE}
        `);

        if (books.length === 0) break;
        books.forEach(b => dbIdsSet.add(b.id));

        await booksIndex.addDocuments(books, { primaryKey: "id" });
        lastId = books[books.length - 1].id;
        processedCount += books.length;
        console.log(`[Worker] Indexed ${processedCount} books (lastId=${lastId})`);
        await job.updateProgress(processedCount);
    }

    let offset = 0;
    while (true) {
        const docs = await booksIndex.getDocuments({
            fields: ["id"],
            limit: BATCH_SIZE,
            offset,
        });

        if (!docs.results || docs.results.length === 0) break;

        const idsToDelete = docs.results
            .map((d: any) => d.id)
            .filter(id => !dbIdsSet.has(id));

        if (idsToDelete.length > 0) {
            await booksIndex.deleteDocuments(idsToDelete);
            console.log(`[Worker] Deleted ${idsToDelete.length} removed books from index`);
        }

        if (docs.results.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
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
