import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

const deletedTables: unknown[] = [];
let executedQuery: unknown;

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
	db: {
		transaction,
		execute: mock((query: unknown) => {
			executedQuery = query;
			return Promise.resolve({ rows: [] });
		}),
	},
}));

const { readListenMatchEvaluation, readListenMatchProposal } = await import(
	"@nanahoshi-v2/db/schema/general"
);
const { ReadListenRepository } = await import("../read-listen.repository");

describe("ReadListenRepository.deletePairAndMatchHistory", () => {
	beforeEach(() => {
		deletedTables.length = 0;
		executedQuery = undefined;
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

describe("ReadListenRepository.listMatchProposalPage", () => {
	test("includes unrepresented manual pairs in the reviewed query", async () => {
		const repository = new ReadListenRepository();

		await repository.listMatchProposalPage("server-1", "ALL", {
			status: "decided",
			offset: 0,
			limit: 10,
		});

		const query = new PgDialect().sqlToQuery(executedQuery as never).sql;
		expect(query).toContain("UNION ALL");
		expect(query).toContain("FROM read_listen_pair rp");
		expect(query).toContain("AND NOT EXISTS");
	});
});

describe("ReadListenRepository.deleteReviewedMatch", () => {
	beforeEach(() => {
		deletedTables.length = 0;
	});

	test("deletes the rejected proposal and its audiobook evaluation", async () => {
		const repository = new ReadListenRepository();

		expect(await repository.deleteReviewedMatch("proposal-1", "server-1")).toBe(
			true,
		);
		expect(deletedTables).toContain(readListenMatchProposal);
		expect(deletedTables).toContain(readListenMatchEvaluation);
	});
});
