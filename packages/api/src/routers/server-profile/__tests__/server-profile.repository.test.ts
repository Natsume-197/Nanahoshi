import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for ServerProfileRepository.deleteServer.
 *
 * Mocks `@nanahoshi/db`; the delete chain captures its `where` argument so
 * we can assert the deletion targets the organization row.
 *
 * Run with:
 *   bun test packages/api/src/routers/server-profile/__tests__/server-profile.repository.test.ts
 */

let deletedTable: unknown = null;
let whereArg: unknown = null;

const mockDelete = mock((table: unknown) => {
	deletedTable = table;
	return {
		where: mock((condition: unknown) => {
			whereArg = condition;
			return Promise.resolve({ rowCount: 1 });
		}),
	};
});

const mockExecute = mock(() => Promise.resolve({ rowCount: 0 }));
const tx = { delete: mockDelete, execute: mockExecute };
mock.module("@nanahoshi/db", () => ({
	db: {
		delete: mockDelete,
		transaction: (run: (t: typeof tx) => Promise<unknown>) => run(tx),
	},
}));

const { organization } = await import("@nanahoshi/db/schema/auth");
const { serverProfileRepository } = await import(
	"../server-profile.repository"
);

/** Cycle-safe deep search — drizzle SQL conditions contain circular refs. */
function containsValue(
	obj: unknown,
	target: string,
	seen = new Set(),
): boolean {
	if (obj === target) return true;
	if (typeof obj !== "object" || obj === null || seen.has(obj)) return false;
	seen.add(obj);
	return Object.values(obj).some((value) => containsValue(value, target, seen));
}

describe("ServerProfileRepository.deleteServer", () => {
	beforeEach(() => {
		deletedTable = null;
		whereArg = null;
		mockDelete.mockClear();
		mockExecute.mockClear();
	});

	test("deletes the organization row filtered by server id", async () => {
		await serverProfileRepository.deleteServer("org-1");

		expect(mockDelete).toHaveBeenCalledTimes(1);
		expect(deletedTable).toBe(organization);
		// Drizzle eq() produces a SQL condition; it must exist and reference our id.
		expect(whereArg).toBeDefined();
		expect(containsValue(whereArg, "org-1")).toBe(true);
		// The server's reading history is removed in the same transaction.
		expect(mockExecute).toHaveBeenCalledTimes(1);
	});
});
