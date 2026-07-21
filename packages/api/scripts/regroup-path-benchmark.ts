// Compares the DB-only edition rebuild with an optimistic lower bound for the
// old reprocess path. The legacy side performs every pre/post-group DB lookup
// but deliberately omits EPUB I/O, so real reprocess can only be slower.
//
// The selected library's duplicate pointers are snapshotted and restored in a
// finally block. Run only against a disposable/local database:
//   cd apps/server
//   bun run ../../packages/api/scripts/regroup-path-benchmark.ts --library=29 --books=1000

import { pool } from "@nanahoshi-v2/db";
import { regroupBookDuplicates } from "../src/modules/duplicateGrouping";
import { bookRepository } from "../src/routers/books/book.repository";
import { bookMetadataRepository } from "../src/routers/books/metadata/metadata.repository";
import { bookMetadataService } from "../src/routers/books/metadata/metadata.service";

function numberArg(name: string, fallback: number): number {
	const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
	const value = Number(raw?.split("=")[1] ?? fallback);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`--${name} must be a positive integer`);
	}
	return value;
}

const libraryId = numberArg("library", 29);
const bookLimit = numberArg("books", 1000);
const concurrency = numberArg("concurrency", 8);

type PointerRow = { id: string; duplicate_of_book_id: string | null };

async function pointers(): Promise<PointerRow[]> {
	const result = await pool.query<PointerRow>(
		`SELECT id::text, duplicate_of_book_id::text
		 FROM book WHERE library_id = $1 ORDER BY id`,
		[libraryId],
	);
	return result.rows;
}

async function runBounded(
	ids: number[],
	operation: (id: number) => Promise<void>,
): Promise<number> {
	const startedAt = performance.now();
	for (let offset = 0; offset < ids.length; offset += concurrency) {
		await Promise.all(ids.slice(offset, offset + concurrency).map(operation));
	}
	return performance.now() - startedAt;
}

function pointerKey(rows: PointerRow[]): string {
	return rows
		.map((row) => `${row.id}:${row.duplicate_of_book_id ?? ""}`)
		.join("|");
}

const originalPointers = await pointers();
try {
	const idsResult = await pool.query<{ id: string }>(
		`SELECT id::text FROM book
		 WHERE library_id = $1 AND group_locked = false
		 ORDER BY id LIMIT $2`,
		[libraryId, bookLimit],
	);
	const ids = idsResult.rows.map((row) => Number(row.id));
	if (ids.length === 0) throw new Error("The selected library has no books");

	await bookRepository.clearAutomaticDuplicatePointersByLibrary(libraryId);
	const legacyMs = await runBounded(ids, async (bookId) => {
		// Optimistic reprocess lower bound: preserve its DB work but omit the
		// remote/local EPUB parse that dominated the production run.
		await bookRepository.getById(bookId);
		await bookMetadataRepository.findByBookId(bookId);
		await bookMetadataRepository.getEnrichRowByBookId(bookId);
		await regroupBookDuplicates(bookId);
		const current = await bookRepository.getById(bookId);
		if (current?.duplicateOfBookId == null) {
			await bookMetadataService.needsExternalEnrichment(bookId);
		}
	});
	const legacyPointers = await pointers();

	await bookRepository.clearAutomaticDuplicatePointersByLibrary(libraryId);
	const regroupMs = await runBounded(ids, regroupBookDuplicates);
	const regroupPointers = await pointers();

	const identical = pointerKey(legacyPointers) === pointerKey(regroupPointers);
	const legacyRate = ids.length / (legacyMs / 1000);
	const regroupRate = ids.length / (regroupMs / 1000);

	console.log(
		JSON.stringify(
			{
				libraryId,
				books: ids.length,
				concurrency,
				legacyLowerBound: {
					ms: Math.round(legacyMs),
					booksPerSecond: Number(legacyRate.toFixed(2)),
				},
				regroupOnly: {
					ms: Math.round(regroupMs),
					booksPerSecond: Number(regroupRate.toFixed(2)),
				},
				speedup: Number((regroupRate / legacyRate).toFixed(2)),
				identicalGrouping: identical,
			},
			null,
			2,
		),
	);
	if (!identical) process.exitCode = 1;
} finally {
	await pool.query(
		`UPDATE book AS b
		 SET duplicate_of_book_id = snapshot.duplicate_of_book_id
		 FROM jsonb_to_recordset($2::jsonb)
		      AS snapshot(id bigint, duplicate_of_book_id bigint)
		 WHERE b.library_id = $1 AND b.id = snapshot.id`,
		[libraryId, JSON.stringify(originalPointers)],
	);
	await pool.end();
}
