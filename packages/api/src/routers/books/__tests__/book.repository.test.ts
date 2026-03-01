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
let insertReturnValue: any[] = [];
/** Captured config passed to `onConflictDoNothing()`. */
let onConflictConfig: any = null;
/** Captured values passed to `values()`. */
let insertedValues: any = null;
/** What `delete().where()` resolves to as `rowCount`. */
let deleteRowCount = 1;

function createInsertChain() {
	const chain: any = {
		values: mock((v: any) => {
			insertedValues = v;
			return chain;
		}),
		onConflictDoNothing: mock((config: any) => {
			onConflictConfig = config;
			return chain;
		}),
		returning: mock(() => insertReturnValue),
	};
	return chain;
}

function createDeleteChain() {
	const chain: any = {
		where: mock(() => Promise.resolve({ rowCount: deleteRowCount })),
	};
	return chain;
}

function createSelectChain() {
	const chain: any = {
		from: mock(() => chain),
		where: mock(() => []),
		innerJoin: mock(() => chain),
		leftJoin: mock(() => chain),
		orderBy: mock(() => chain),
		limit: mock(() => chain),
	};
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
