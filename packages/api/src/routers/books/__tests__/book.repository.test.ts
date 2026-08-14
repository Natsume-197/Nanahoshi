import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * Unit tests for BookRepository.
 *
 * We mock `@nanahoshi-v2/db` (the Drizzle client) but import the real schema
 * from `@nanahoshi-v2/db/schema/general` so we can assert that the conflict
 * target references the actual Drizzle column objects.
 *
 * Run with:
 *   bun test packages/api/src/routers/books/__tests__/book.repository.test.ts
 */

// ─── Mock: Drizzle DB ────────────────────────────────────────────────────────
// These variables are mutated per-test to control what the mock DB returns.

/** What `returning()` resolves to. Set to [] to simulate a conflict (no insert). */
let insertReturnValue: Array<Record<string, unknown>> = [];
/** Captured config passed to `onConflictDoNothing()`. */
let onConflictConfig: Record<string, unknown> | null = null;
/** Captured values passed to `values()`. */
let insertedValues: Record<string, unknown> | null = null;
/** What `delete().where()` resolves to as `rowCount`. */
let deleteRowCount = 1;
/** What an awaited `select()…` chain resolves to. */
let selectResult: Array<Record<string, unknown>> = [];

function createInsertChain() {
	const chain = {} as {
		values: ReturnType<typeof mock>;
		onConflictDoNothing: ReturnType<typeof mock>;
		returning: ReturnType<typeof mock>;
	};

	chain.values = mock((v: unknown) => {
		insertedValues =
			v && typeof v === "object" ? (v as Record<string, unknown>) : null;
		return chain;
	});
	chain.onConflictDoNothing = mock((config: unknown) => {
		onConflictConfig =
			config && typeof config === "object"
				? (config as Record<string, unknown>)
				: null;
		return chain;
	});
	chain.returning = mock(() => insertReturnValue);
	return chain;
}

function createDeleteChain() {
	const chain = {} as {
		where: ReturnType<typeof mock>;
	};
	chain.where = mock(() => Promise.resolve({ rowCount: deleteRowCount }));
	return chain;
}

function createSelectChain() {
	// A thenable chain: every builder method returns `this`, and awaiting it
	// resolves to `selectResult`, so `.from().where().limit()` then `await` works.
	const chain = Promise.resolve().then(() => selectResult) as Promise<
		Array<Record<string, unknown>>
	> & {
		from: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
		innerJoin: ReturnType<typeof mock>;
		leftJoin: ReturnType<typeof mock>;
		orderBy: ReturnType<typeof mock>;
		limit: ReturnType<typeof mock>;
	};

	chain.from = mock(() => chain);
	chain.where = mock(() => chain);
	chain.innerJoin = mock(() => chain);
	chain.leftJoin = mock(() => chain);
	chain.orderBy = mock(() => chain);
	chain.limit = mock(() => chain);
	return chain;
}

/** Rows an awaited `db.execute()` resolves to (raw-SQL queries). */
let executeResult: Array<Record<string, unknown>> = [];
let executedQuery: SQL | null = null;

const mockInsert = mock(() => createInsertChain());
const mockSelect = mock(() => createSelectChain());
const mockDelete = mock(() => createDeleteChain());
const mockExecute = mock((query: SQL) => {
	executedQuery = query;
	return Promise.resolve({ rows: executeResult });
});

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: mockInsert,
		select: mockSelect,
		delete: mockDelete,
		execute: mockExecute,
	},
}));

// Mock env to prevent validation errors when the module graph pulls it in
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

// ─── Import real schema + module under test ──────────────────────────────────

const { book } = await import("@nanahoshi-v2/db/schema/general");
const { BookRepository } = await import("../book.repository");

// Patch the metadata repository singleton in place (module mocks leak across
// test files in the shared bun process and would hide the real repository).
const { bookMetadataRepository } = await import(
	"../metadata/metadata.repository"
);
const findByBookIdSpy = spyOn(
	bookMetadataRepository,
	"findByBookId",
).mockImplementation(() =>
	Promise.resolve(
		null as Awaited<ReturnType<typeof bookMetadataRepository.findByBookId>>,
	),
);
afterAll(() => {
	findByBookIdSpy.mockRestore();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

// Renders the condition the last select() chain was given, so a where-clause
// can be asserted on as SQL text + params.
function renderWhere() {
	const chain = mockSelect.mock.results.at(-1)?.value as {
		where: { mock: { calls: unknown[][] } };
	};
	const condition = chain.where.mock.calls.at(-1)?.[0];
	const query = new PgDialect().sqlToQuery(condition as SQL);
	return { sql: query.sql, params: query.params };
}

describe("BookRepository", () => {
	let repo: InstanceType<typeof BookRepository>;

	beforeEach(() => {
		repo = new BookRepository();
		insertReturnValue = [
			{
				id: 1,
				uuid: "test-uuid",
				filename: "test.epub",
				filehash: "abc123",
				libraryId: 1,
				libraryPathId: 100,
				relativePath: "test.epub",
				filesizeKb: 1024,
				lastModified: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				userId: null,
				mediaType: null,
			},
		];
		onConflictConfig = null;
		insertedValues = null;
		deleteRowCount = 1;
		selectResult = [];
		executeResult = [];
		mockInsert.mockClear();
		mockSelect.mockClear();
		mockDelete.mockClear();
		mockExecute.mockClear();
	});

	test("create() passes the input to db.insert().values() and returns the inserted row", async () => {
		const input = {
			uuid: "test-uuid",
			filename: "test.epub",
			filehash: "abc123",
			libraryId: 1,
			libraryPathId: 100,
			relativePath: "test.epub",
			filesizeKb: 1024,
			lastModified: new Date().toISOString(),
		};

		const result = await repo.create(input);

		expect(mockInsert).toHaveBeenCalled();
		expect(insertedValues).toEqual(input);
		expect(result).toBeDefined();
		expect(result.filename).toBe("test.epub");
	});

	test("create() targets the composite unique [libraryId, filehash] (not filehash alone)", async () => {
		// BUG FIX: the old code used `{ target: book.filehash }` which meant a
		// file with the same hash could never exist in two different libraries.
		// Now it targets the composite index so the same file can live in
		// multiple libraries.
		const input = {
			uuid: "test-uuid",
			filename: "test.epub",
			filehash: "abc123",
			libraryId: 1,
			libraryPathId: 100,
			relativePath: "test.epub",
			filesizeKb: 1024,
			lastModified: new Date().toISOString(),
		};

		await repo.create(input);

		expect(onConflictConfig).toBeDefined();
		// Must reference the real Drizzle column objects, not strings
		expect(onConflictConfig.target).toEqual([book.libraryId, book.filehash]);
	});

	test("create() returns undefined when a conflict occurs (returning() is empty)", async () => {
		// Simulate a duplicate: Postgres returns no rows from RETURNING
		insertReturnValue = [];

		const input = {
			uuid: "test-uuid",
			filename: "test.epub",
			filehash: "abc123",
			libraryId: 1,
			libraryPathId: 100,
			relativePath: "test.epub",
			filesizeKb: 1024,
			lastModified: new Date().toISOString(),
		};

		const result = await repo.create(input);

		// The worker checks `if (bookInserted)` to decide whether to enrich
		// metadata, so undefined must mean "skipped due to conflict"
		expect(result).toBeUndefined();
	});

	test("same filehash in different libraries can both be inserted (composite key allows it)", async () => {
		const input1 = {
			uuid: "uuid-1",
			filename: "test.epub",
			filehash: "abc123",
			libraryId: 1,
			libraryPathId: 100,
			relativePath: "test.epub",
			filesizeKb: 1024,
			lastModified: new Date().toISOString(),
		};

		const input2 = {
			uuid: "uuid-2",
			filename: "test.epub",
			filehash: "abc123",
			libraryId: 2, // different library
			libraryPathId: 200,
			relativePath: "test.epub",
			filesizeKb: 1024,
			lastModified: new Date().toISOString(),
		};

		insertReturnValue = [
			{ ...input1, id: 1, createdAt: "", userId: null, mediaType: null },
		];
		await repo.create(input1);

		insertReturnValue = [
			{ ...input2, id: 2, createdAt: "", userId: null, mediaType: null },
		];
		const result2 = await repo.create(input2);

		// Both inserts should go through because (libraryId=1, filehash) != (libraryId=2, filehash)
		expect(result2).toBeDefined();
		expect(mockInsert).toHaveBeenCalledTimes(2);
	});

	test("existsByLibraryAndHash() returns true when a matching row is found", async () => {
		// Upload dedupe relies on this: a book already in the library with the same
		// content hash must be detected before the file is written.
		selectResult = [{ id: 7 }];
		const exists = await repo.existsByLibraryAndHash(1, "abc123");
		expect(exists).toBe(true);
		expect(mockSelect).toHaveBeenCalled();
	});

	test("existsByLibraryAndHash() returns false when no row matches", async () => {
		selectResult = [];
		const exists = await repo.existsByLibraryAndHash(1, "no-such-hash");
		expect(exists).toBe(false);
	});

	test("removeBook() returns true when a row is deleted", async () => {
		deleteRowCount = 1;
		const result = await repo.removeBook(1);
		expect(result).toBe(true);
		expect(mockDelete).toHaveBeenCalled();
	});

	test("removeBook() returns false when no row matches the id", async () => {
		deleteRowCount = 0;
		const result = await repo.removeBook(999);
		expect(result).toBe(false);
	});

	// getWithMetadata resolves everything (siblings included) in one round trip;
	// these tests pin the single-query contract and the sibling-group mapping.
	const baseDetailRow = {
		id: 10,
		created_at: "2026-01-01T00:00:00Z",
		filename: "vol1.epub",
		user_id: null,
		last_modified: null,
		filesize_kb: 2048,
		library_id: 1,
		library_path_id: 100,
		media_type: "ebook",
		filehash: "s2:abc",
		relative_path: "vol1.epub",
		uuid: "book-uuid-10",
		duplicate_of_book_id: null,
		libraryMediaType: "ebook",
		libraryUuid: "lib-uuid",
		libraryName: "Main",
		title: "Vol 1",
		publisher: { uuid: "pub-uuid", name: "Pub" },
		series: null,
		authors: [{ uuid: "a1", name: "Author One", role: null, provider: null }],
		genres: [],
		tags: [],
		siblings: [
			{
				id: 10,
				uuid: "book-uuid-10",
				filename: "vol1.epub",
				mediaType: "ebook",
				filesizeKb: 2048,
				isCanonical: true,
			},
			{
				id: 11,
				uuid: "book-uuid-11",
				filename: "vol1-copy.epub",
				mediaType: "ebook",
				filesizeKb: 1024,
				isCanonical: false,
			},
		],
	};

	test("getWithMetadata() resolves detail + siblings in a single query", async () => {
		executeResult = [baseDetailRow];
		const result = await repo.getWithMetadata("book-uuid-10", "org-1", "ALL");
		expect(mockExecute).toHaveBeenCalledTimes(1);
		expect(result?.uuid).toBe("book-uuid-10");
		expect(result?.isDuplicate).toBe(false);
		expect(result?.canonicalUuid).toBe("book-uuid-10");
		// The viewed book is excluded from its own copies list.
		expect(result?.otherCopies).toEqual([
			{
				uuid: "book-uuid-11",
				filename: "vol1-copy.epub",
				mediaType: "ebook",
				filesizeKb: 1024,
			},
		]);
		expect(result?.authors).toEqual([
			{ uuid: "a1", name: "Author One", role: "Author", provider: null },
		]);
	});

	test("getWithMetadata() on a hidden duplicate points at its canonical", async () => {
		executeResult = [
			{
				...baseDetailRow,
				id: 11,
				uuid: "book-uuid-11",
				filename: "vol1-copy.epub",
				duplicate_of_book_id: 10,
			},
		];
		const result = await repo.getWithMetadata("book-uuid-11", "org-1", "ALL");
		expect(result?.isDuplicate).toBe(true);
		expect(result?.canonicalUuid).toBe("book-uuid-10");
		// The canonical is reachable via the banner, so it isn't repeated here.
		expect(result?.otherCopies).toEqual([]);
		expect(executedQuery).not.toBeNull();
		const query = new PgDialect().sqlToQuery(executedQuery as SQL).sql;
		expect(query).toContain(
			"bs.book_id = COALESCE(b.duplicate_of_book_id, b.id)",
		);
	});

	test("getWithMetadata() returns null when no row matches", async () => {
		executeResult = [];
		const result = await repo.getWithMetadata("missing", "org-1", "ALL");
		expect(result).toBeNull();
	});
	test("countAllBooks() narrows to one library when the facet is set", async () => {
		const libraryUuid = "11111111-2222-3333-4444-555555555555";
		await repo.countAllBooks("org-1", "ALL", {
			mediaType: "ebook",
			libraryUuid,
		});

		const { sql, params } = renderWhere();
		expect(sql).toContain('"library"."uuid"');
		expect(params).toContain(libraryUuid);
	});

	test("countAllBooks() leaves the catalog unscoped without the facet", async () => {
		await repo.countAllBooks("org-1", "ALL", { mediaType: "ebook" });

		const { sql } = renderWhere();
		expect(sql).not.toContain('"library"."uuid"');
	});
});
