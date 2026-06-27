import { beforeEach, describe, expect, mock, test } from "bun:test";

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

const mockInsert = mock(() => createInsertChain());
const mockSelect = mock(() => createSelectChain());
const mockDelete = mock(() => createDeleteChain());

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: mockInsert,
		select: mockSelect,
		delete: mockDelete,
	},
}));

// Mock env to prevent validation errors when the module graph pulls it in
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

mock.module("../metadata/metadata.repository", () => ({
	bookMetadataRepository: {
		findByBookId: mock(() => Promise.resolve(null)),
	},
}));

// ─── Import real schema + module under test ──────────────────────────────────

const { book } = await import("@nanahoshi-v2/db/schema/general");
const { BookRepository } = await import("../book.repository");

// ─── Tests ───────────────────────────────────────────────────────────────────

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
		mockInsert.mockClear();
		mockSelect.mockClear();
		mockDelete.mockClear();
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
});
