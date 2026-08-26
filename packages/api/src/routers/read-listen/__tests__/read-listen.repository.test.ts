import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

const deletedTables: unknown[] = [];
let executedQuery: unknown;
let selectedWhere: unknown;

const select = mock(() => {
	const chain = {
		from: mock(() => chain),
		leftJoin: mock(() => chain),
		innerJoin: mock(() => chain),
		where: mock((condition: unknown) => {
			selectedWhere = condition;
			return chain;
		}),
		orderBy: mock(() => chain),
		offset: mock(() => chain),
		limit: mock(() => Promise.resolve([])),
	};
	return chain;
});

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
		select,
		transaction,
		execute: mock((query: unknown) => {
			executedQuery = query;
			return Promise.resolve({ rows: [] });
		}),
	},
}));

const { readListenMatchEvaluation } = await import(
	"@nanahoshi-v2/db/schema/general"
);
const { ReadListenRepository } = await import("../read-listen.repository");

describe("ReadListenRepository.deletePairAndMatchHistory", () => {
	beforeEach(() => {
		deletedTables.length = 0;
		executedQuery = undefined;
		selectedWhere = undefined;
		select.mockClear();
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

describe("ReadListenRepository.listAllPairRows", () => {
	test("filters ready alignments using the current publication hashes", async () => {
		const repository = new ReadListenRepository();

		await repository.listAllPairRows("server-1", 0, 30, "ready");

		const query = new PgDialect().sqlToQuery(selectedWhere as never).sql;
		expect(query).toContain("read_listen_alignment");
		expect(query).toContain("read_listen_ebook");
		expect(query).toContain("read_listen_audiobook");
		expect(query).toContain(" = ");
	});

	test("separates missing and stale alignments before pagination", async () => {
		const repository = new ReadListenRepository();

		await repository.listAllPairRows("server-1", 0, 30, "not_imported");
		const missingQuery = new PgDialect().sqlToQuery(selectedWhere as never).sql;
		expect(missingQuery).toContain("is null");

		await repository.listAllPairRows("server-1", 0, 30, "stale");
		const staleQuery = new PgDialect().sqlToQuery(selectedWhere as never).sql;
		expect(staleQuery).toContain(" <> ");
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

	test("applies edit scope to corrected ebooks before counting the page", async () => {
		const repository = new ReadListenRepository();

		await repository.listMatchProposalPage("server-1", [7], {
			status: "decided",
			offset: 0,
			limit: 10,
		});

		const query = new PgDialect().sqlToQuery(executedQuery as never).sql;
		expect(query).toContain("selected_ebook.library_id");
		expect(query).toContain("selected_el.server_id");
	});
});
