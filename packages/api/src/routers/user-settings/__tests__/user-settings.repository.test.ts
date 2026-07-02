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

function createInsertChain() {
	const chain = {} as {
		values: ReturnType<typeof mock>;
		onConflictDoUpdate: ReturnType<typeof mock>;
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

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: mockInsert,
		select: mockSelect,
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
		mockInsert.mockClear();
		mockSelect.mockClear();
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
});
