import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { JOB_RETENTION } from "../job-retention";

/**
 * job-retention.ts pulls in nothing but a bullmq type, so it imports without
 * Redis. The queue modules themselves construct a live `Queue`, so they are
 * asserted from source rather than imported.
 */

const QUEUES_DIR = path.join(import.meta.dir, "..");

function queueFiles(): string[] {
	return readdirSync(QUEUES_DIR).filter((f) => f.endsWith(".queue.ts"));
}

describe("JOB_RETENTION", () => {
	test("caps completed jobs so a full scan can't grow Redis without bound", () => {
		expect(JOB_RETENTION.removeOnComplete).toEqual({ count: 500 });
	});

	test("keeps failures count-based, never `true`", () => {
		// task-progress.listener resolves failures with `Job.fromId` to tell a
		// terminal failure from a retry; dropping the record on failure would
		// silently stop counting them.
		expect(JOB_RETENTION.removeOnFail).toEqual({ count: 1000 });
		expect(typeof JOB_RETENTION.removeOnFail).toBe("object");
	});
});

describe("queue modules", () => {
	test("every queue file exists and is discovered", () => {
		// Guards the sweep below against silently matching nothing.
		expect(queueFiles().length).toBeGreaterThanOrEqual(10);
	});

	test.each(queueFiles())("%s wires in JOB_RETENTION", (file) => {
		const src = readFileSync(path.join(QUEUES_DIR, file), "utf8");
		expect(src).toContain('from "./job-retention"');
		expect(src).toContain("...JOB_RETENTION");
	});

	test.each(
		queueFiles(),
	)("%s does not override retention with a bare boolean", (file) => {
		const src = readFileSync(path.join(QUEUES_DIR, file), "utf8");
		expect(src).not.toMatch(/removeOnFail:\s*(true|\d)/);
	});
});
