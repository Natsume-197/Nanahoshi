import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for UserSettingsRepository.
 *
 * We mock `@nanahoshi-v2/db` (the Drizzle client) but import the real schema
 * from `@nanahoshi-v2/db/schema/general` so we can assert that the conflict
 * target references the actual Drizzle column objects.
 *
 * Run with:
 *   bun test packages/api/src/routers/user-settings/__tests__/user-settings.repository.test.ts
 */

/** Captured values passed to `values()`. */
let insertedValues: Record<string, unknown> | null = null;
/** Captured config passed to `onConflictDoUpdate()`. */
let onConflictConfig: Record<string, unknown> | null = null;
/** What an awaited `select()…` chain resolves to. */
let selectResult: Array<Record<string, unknown>> = [];
let writeResult: Array<Record<string, unknown>> = [];

function createInsertChain() {
	const chain = {} as {
		values: ReturnType<typeof mock>;
		onConflictDoUpdate: ReturnType<typeof mock>;
		onConflictDoNothing: ReturnType<typeof mock>;
		returning: ReturnType<typeof mock>;
	};

	chain.values = mock((v: unknown) => {
		insertedValues =
			v && typeof v === "object" ? (v as Record<string, unknown>) : null;
		return chain;
	});
	// last call in the chain: awaiting its result resolves the upsert
	chain.onConflictDoUpdate = mock((config: unknown) => {
		onConflictConfig =
			config && typeof config === "object"
				? (config as Record<string, unknown>)
				: null;
		return Promise.resolve();
	});
	chain.onConflictDoNothing = mock((config: unknown) => {
		onConflictConfig =
			config && typeof config === "object"
				? (config as Record<string, unknown>)
				: null;
		return chain;
	});
	chain.returning = mock(() => Promise.resolve(writeResult));
	return chain;
}

function createUpdateChain() {
	const chain = {} as {
		set: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
		returning: ReturnType<typeof mock>;
	};
	chain.set = mock(() => chain);
	chain.where = mock(() => chain);
	chain.returning = mock(() => Promise.resolve(writeResult));
	return chain;
}

function createSelectChain() {
	const chain = Promise.resolve().then(() => selectResult) as Promise<
		Array<Record<string, unknown>>
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

const mockInsert = mock(() => createInsertChain());
const mockSelect = mock(() => createSelectChain());
const mockUpdate = mock(() => createUpdateChain());

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: mockInsert,
		select: mockSelect,
		update: mockUpdate,
	},
}));

const { userSettings } = await import("@nanahoshi-v2/db/schema/general");
const { UserSettingsRepository } = await import("../user-settings.repository");

describe("UserSettingsRepository", () => {
	let repo: InstanceType<typeof UserSettingsRepository>;

	beforeEach(() => {
		repo = new UserSettingsRepository();
		insertedValues = null;
		onConflictConfig = null;
		selectResult = [];
		writeResult = [];
		mockInsert.mockClear();
		mockSelect.mockClear();
		mockUpdate.mockClear();
	});

	test("upsert targets the (userId, key) unique constraint and updates value", async () => {
		await repo.upsert("user-1", "reader-profiles", { profiles: [] });

		expect(insertedValues).toEqual({
			userId: "user-1",
			key: "reader-profiles",
			value: { profiles: [] },
		});
		expect(onConflictConfig?.target).toEqual([
			userSettings.userId,
			userSettings.key,
		]);
		const set = onConflictConfig?.set as Record<string, unknown>;
		expect(set.value).toEqual({ profiles: [] });
		expect(set.updatedAt).toBeInstanceOf(Date);
	});

	test("get returns the stored value with its timestamp", async () => {
		const updatedAt = new Date();
		selectResult = [{ value: { profiles: [] }, updatedAt }];

		const row = await repo.get("user-1", "reader-profiles");
		expect(row).toEqual({ value: { profiles: [] }, updatedAt });
	});

	test("get returns null when the user has no row for the key", async () => {
		const row = await repo.get("user-1", "reader-profiles");
		expect(row).toBeNull();
	});

	test("creates only when the client expects no existing revision", async () => {
		const updatedAt = new Date();
		writeResult = [{ updatedAt }];

		const result = await repo.upsert(
			"user-1",
			"reader-profiles",
			{ profiles: [] },
			null,
		);

		expect(result).toEqual({ updatedAt });
		expect(onConflictConfig?.target).toEqual([
			userSettings.userId,
			userSettings.key,
		]);
	});

	test("returns null when a compare-and-swap revision is stale", async () => {
		const result = await repo.upsert(
			"user-1",
			"reader-profiles",
			{ profiles: [] },
			new Date("2026-01-01T00:00:00.000Z"),
		);

		expect(result).toBeNull();
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});
});
