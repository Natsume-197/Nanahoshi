import { beforeEach, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

const where = mock((_condition: Parameters<PgDialect["sqlToQuery"]>[0]) =>
	Promise.resolve(),
);
const set = mock((_values: Record<string, unknown>) => ({ where }));
const update = mock(() => ({ set }));
mock.module("@nanahoshi-v2/db", () => ({ db: { update } }));
const { scannedFileRepository } = await import("../scannedFile.repository");

beforeEach(() => {
	where.mockClear();
	set.mockClear();
	update.mockClear();
});

test("marks every track in bounded queries scoped to the library path", async () => {
	const paths = Array.from({ length: 2_001 }, (_, i) => `/audio/${i}.mp3`);
	await scannedFileRepository.markDoneBatch(paths, 42);

	expect(update).toHaveBeenCalledTimes(3);
	const updatedPaths: unknown[] = [];
	for (const [condition] of where.mock.calls) {
		const query = new PgDialect().sqlToQuery(condition);
		expect(query.sql).toContain('"scanned_file"."path" in');
		expect(query.sql).toContain('and "scanned_file"."library_path_id" =');
		expect(query.params.at(-1)).toBe(42);
		expect(query.params.length).toBeLessThanOrEqual(1_001);
		updatedPaths.push(...query.params.slice(0, -1));
	}
	expect(updatedPaths).toEqual(paths);
	for (const [values] of set.mock.calls) {
		expect(values.status).toBe("done");
	}
});

test("an empty batch does not issue an update", async () => {
	await scannedFileRepository.markDoneBatch([], 42);
	expect(update).not.toHaveBeenCalled();
});
