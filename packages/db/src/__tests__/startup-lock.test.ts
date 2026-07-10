import { describe, expect, test } from "bun:test";
import { STARTUP_LOCK_ID, withStartupLockUsing } from "../startup-lock";

type Call =
	| { kind: "query"; text: string; values?: unknown[] }
	| { kind: "release" }
	| { kind: "fn" };

function makePool(opts?: { failOnLock?: boolean }) {
	const calls: Call[] = [];
	const client = {
		query: (text: string, values?: unknown[]) => {
			calls.push({ kind: "query", text, values });
			if (opts?.failOnLock && text.includes("pg_advisory_lock(")) {
				return Promise.reject(new Error("connection lost"));
			}
			return Promise.resolve({ rows: [] });
		},
		release: () => {
			calls.push({ kind: "release" });
		},
	};
	return { pool: { connect: () => Promise.resolve(client) }, calls };
}

describe("withStartupLockUsing", () => {
	test("locks before fn, unlocks after, releases the client", async () => {
		const { pool, calls } = makePool();

		const result = await withStartupLockUsing(pool, async () => {
			calls.push({ kind: "fn" });
			return "done";
		});

		expect(result).toBe("done");
		expect(calls).toEqual([
			{
				kind: "query",
				text: "SELECT pg_advisory_lock($1)",
				values: [STARTUP_LOCK_ID],
			},
			{ kind: "fn" },
			{
				kind: "query",
				text: "SELECT pg_advisory_unlock($1)",
				values: [STARTUP_LOCK_ID],
			},
			{ kind: "release" },
		]);
	});

	test("unlocks and releases even when fn throws", async () => {
		const { pool, calls } = makePool();

		await expect(
			withStartupLockUsing(pool, async () => {
				throw new Error("migration failed");
			}),
		).rejects.toThrow("migration failed");

		const unlock = calls.find(
			(c) => c.kind === "query" && c.text.includes("pg_advisory_unlock("),
		);
		expect(unlock).toBeDefined();
		expect(calls.at(-1)).toEqual({ kind: "release" });
	});

	test("releases the client when acquiring the lock fails, without running fn", async () => {
		const { pool, calls } = makePool({ failOnLock: true });
		let ran = false;

		await expect(
			withStartupLockUsing(pool, async () => {
				ran = true;
			}),
		).rejects.toThrow("connection lost");

		expect(ran).toBe(false);
		expect(calls.at(-1)).toEqual({ kind: "release" });
	});
});
