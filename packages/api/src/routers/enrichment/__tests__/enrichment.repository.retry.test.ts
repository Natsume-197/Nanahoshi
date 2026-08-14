import { describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

let conflictConfig: {
	set?: Record<string, unknown>;
} | null = null;
let insertedValues: Record<string, unknown> | null = null;

function insertChain() {
	const chain = {
		values: mock((values: Record<string, unknown>) => {
			insertedValues = values;
			return chain;
		}),
		onConflictDoUpdate: mock((config: { set?: Record<string, unknown> }) => {
			conflictConfig = config;
			return Promise.resolve();
		}),
	};
	return chain;
}

let updateSet: Record<string, unknown> | null = null;
let updateWhere: unknown = null;
let returningRows: { bookId: number }[] = [];
let executedQuery: unknown = null;
let selectedRows: Record<string, unknown>[] = [];

function updateChain() {
	const chain = {
		set: mock((data: Record<string, unknown>) => {
			updateSet = data;
			return chain;
		}),
		where: mock((cond: unknown) => {
			updateWhere = cond;
			return chain;
		}),
		returning: mock(() => Promise.resolve(returningRows)),
	};
	return chain;
}

function selectChain() {
	const chain = Promise.resolve().then(() => selectedRows) as Promise<
		Record<string, unknown>[]
	> & {
		from: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
		limit: ReturnType<typeof mock>;
	};
	chain.from = mock(() => chain);
	chain.where = mock(() => chain);
	chain.limit = mock(() => chain);
	return chain;
}

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: mock(insertChain),
		update: mock(updateChain),
		select: mock(selectChain),
		execute: mock((query: unknown) => {
			executedQuery = query;
			return Promise.resolve({ rows: [] });
		}),
	},
}));

const { enrichmentStateRepository } = await import("../enrichment.repository");

function compiledWhere() {
	expect(updateWhere).toBeDefined();
	return new PgDialect().sqlToQuery(
		updateWhere as Parameters<PgDialect["sqlToQuery"]>[0],
	).sql;
}

function compiledNextRetrySql() {
	const nextRetryAt = conflictConfig?.set?.nextRetryAt;
	expect(nextRetryAt).toBeDefined();
	return new PgDialect().sqlToQuery(
		nextRetryAt as Parameters<PgDialect["sqlToQuery"]>[0],
	).sql;
}

function compiledExecutedSql() {
	expect(executedQuery).toBeDefined();
	return new PgDialect().sqlToQuery(
		executedQuery as Parameters<PgDialect["sqlToQuery"]>[0],
	).sql;
}

describe("EnrichmentStateRepository retry invariants", () => {
	test("persists an ambiguous decision separately from failures", async () => {
		const decision = {
			kind: "ambiguous" as const,
			candidates: [
				{ provider: "ranobedb", providerId: "1" },
				{ provider: "ranobedb", providerId: "2" },
			],
		};

		await enrichmentStateRepository.recordRun(1126, {
			status: "no_match",
			decision,
			failures: [],
		});

		expect(insertedValues?.decision).toEqual(decision);
		expect(conflictConfig?.set?.decision).toEqual(decision);
		expect(insertedValues?.failures).toEqual([]);
	});

	test("a failure over a terminal row cannot schedule an undispatchable retry", async () => {
		await enrichmentStateRepository.recordFailures(
			1126,
			[
				{
					provider: "googlebooks",
					phase: "discovery",
					kind: "transient",
					code: "provider_cooldown",
					at: "2026-07-24T15:38:48.674Z",
				},
			],
			new Date("2026-07-24T15:43:31.312Z"),
		);

		const query = compiledNextRetrySql();
		expect(query).toContain(
			`"enrichment_state"."status" NOT IN ('pending', 'partial')`,
		);
		expect(query).toMatch(/ELSE \$\d+::timestamptz/);
	});

	test("a retry timestamp in a regular run is typed as timestamptz", async () => {
		await enrichmentStateRepository.recordRun(1126, {
			status: "pending",
			nextRetryAt: new Date("2026-07-24T15:43:31.312Z"),
		});

		expect(compiledNextRetrySql()).toMatch(/ELSE \$\d+::timestamptz/);
	});

	test("a retry timestamp in a partial match is typed as timestamptz", async () => {
		await enrichmentStateRepository.recordPartialMatch(1126, {
			nextRetryAt: new Date("2026-07-24T15:43:31.312Z"),
		});

		expect(compiledNextRetrySql()).toMatch(/ELSE \$\d+::timestamptz/);
	});
});

describe("EnrichmentStateRepository decision projection", () => {
	test("includes the decision in match detail", async () => {
		await enrichmentStateRepository.detail("server-1", "book-1");
		expect(compiledExecutedSql()).toContain("es.decision");
	});
});

describe("EnrichmentStateRepository duplicate release", () => {
	test("reopens only absent and no_match states", async () => {
		selectedRows = [];
		expect(
			await enrichmentStateRepository.shouldReopenAfterDuplicateRelease(1),
		).toBe(true);

		selectedRows = [{ status: "no_match" }];
		expect(
			await enrichmentStateRepository.shouldReopenAfterDuplicateRelease(1),
		).toBe(true);

		for (const status of ["enriched", "review", "partial", "pending"]) {
			selectedRows = [{ status }];
			expect(
				await enrichmentStateRepository.shouldReopenAfterDuplicateRelease(1),
			).toBe(false);
		}
	});
});

describe("EnrichmentStateRepository stop / archive", () => {
	test("stop is a no-op for an empty selection", async () => {
		updateWhere = null;
		const stopped = await enrichmentStateRepository.stop([]);
		expect(stopped).toBe(0);
		expect(updateWhere).toBeNull();
	});

	test("stop only targets retryable, non-archived, not-yet-stopped rows", async () => {
		returningRows = [{ bookId: 1 }, { bookId: 2 }];
		const stopped = await enrichmentStateRepository.stop([1, 2]);
		expect(stopped).toBe(2);

		// Cancellation is durable and fences leased jobs; the pending retry clears.
		expect(updateSet?.retryCancelledAt).toBeDefined();
		expect(updateSet?.nextRetryAt).toBeNull();
		expect(updateSet?.retryGeneration).toBeDefined();

		const where = compiledWhere();
		expect(where).toContain(`"enrichment_state"."status" in (`);
		expect(where).toContain(`"enrichment_state"."archived_at" is null`);
		expect(where).toContain(`"enrichment_state"."retry_cancelled_at" is null`);
	});

	test("archive stamps archived_at only for not-yet-archived rows", async () => {
		returningRows = [{ bookId: 3 }];
		const archived = await enrichmentStateRepository.archive([3]);
		expect(archived).toBe(1);
		expect(updateSet?.archivedAt).toBeDefined();
		expect(updateSet?.archivedAt).not.toBeNull();
		expect(compiledWhere()).toContain(
			`"enrichment_state"."archived_at" is null`,
		);
	});

	// Archiving retires a book, so it must also drop the pending appointment:
	// otherwise the dispatcher keeps enriching a row filed away in History, and
	// restoring it would show a retry that no longer exists.
	test("archive also stops the book, like stop does", async () => {
		returningRows = [{ bookId: 3 }];
		await enrichmentStateRepository.archive([3]);
		expect(updateSet?.nextRetryAt).toBeNull();
		expect(updateSet?.retryCancelledAt).toBeDefined();

		const cancelledAt = new PgDialect().sqlToQuery(
			updateSet?.retryCancelledAt as Parameters<PgDialect["sqlToQuery"]>[0],
		).sql;
		// An already-stopped book keeps its original cancellation timestamp.
		expect(cancelledAt).toContain("coalesce");

		const generation = new PgDialect().sqlToQuery(
			updateSet?.retryGeneration as Parameters<PgDialect["sqlToQuery"]>[0],
		).sql;
		expect(generation).toContain(`"retry_generation" + `);
	});

	test("unarchive clears archived_at only for archived rows", async () => {
		returningRows = [{ bookId: 3 }];
		const restored = await enrichmentStateRepository.unarchive([3]);
		expect(restored).toBe(1);
		expect(updateSet?.archivedAt).toBeNull();
		expect(compiledWhere()).toContain(
			`"enrichment_state"."archived_at" is not null`,
		);
	});
});

describe("EnrichmentStateRepository actionable provider failures", () => {
	test("provider summary excludes transient cooldowns from the disable action", async () => {
		executedQuery = null;
		await enrichmentStateRepository.providerFailureSummary("server-1", "lib-1");

		expect(compiledExecutedSql()).toContain(`f->>'kind' = 'permanent'`);
	});

	test("affected-book count only includes unmatched permanent failures", async () => {
		executedQuery = null;
		await enrichmentStateRepository.failingBookCount("server-1", "lib-1");

		const query = compiledExecutedSql();
		expect(query).toContain("jsonb_array_elements(es.failures)");
		expect(query).toContain(`f->>'kind' = 'permanent'`);
		expect(query).toContain(`mm->>'provider' = f->>'provider'`);
	});
});
