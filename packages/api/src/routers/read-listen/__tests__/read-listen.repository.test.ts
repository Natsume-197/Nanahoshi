import { beforeEach, describe, expect, mock, test } from "bun:test";

const deletedTables: unknown[] = [];

function createAwaitableChain(result: unknown) {
	const chain = {
		where: mock(() => chain),
		returning: mock(() => Promise.resolve(result)),
		// biome-ignore lint/suspicious/noThenProperty: mock emulates Drizzle's awaitable query builder
		then: (resolve: (value: unknown) => unknown) => resolve([]),
	};
	return chain;
}

const transaction = mock(
	(callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
		const selectChain = {
			from: mock(() => selectChain),
			where: mock(() => selectChain),
		};
		const tx = {
			delete: mock((table: unknown) => {
				deletedTables.push(table);
				return createAwaitableChain(
					deletedTables.length === 1
						? [{ audiobookBookId: 20, ebookBookId: 10 }]
						: [],
				);
			}),
			select: mock(() => selectChain),
		};
		return callback(tx);
	},
);

mock.module("@nanahoshi-v2/db", () => ({
	db: { transaction },
}));

const { readListenMatchEvaluation } = await import(
	"@nanahoshi-v2/db/schema/general"
);
const { ReadListenRepository } = await import("../read-listen.repository");

describe("ReadListenRepository.deletePairAndMatchHistory", () => {
	beforeEach(() => {
		deletedTables.length = 0;
		transaction.mockClear();
	});

	test("makes the removed audiobook eligible for matching again", async () => {
		const repository = new ReadListenRepository();

		expect(
			await repository.deletePairAndMatchHistory("pair-1", "server-1"),
		).toBe(true);
		expect(deletedTables).toContain(readListenMatchEvaluation);
	});
});
