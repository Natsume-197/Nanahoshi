import { describe, expect, test } from "bun:test";
import {
	adjustMemoryPressureTargets,
	sampleMemoryPressureTargets,
} from "../memory-pressure-controller";

describe("memory pressure controller", () => {
	test("raises a saturated worker beyond its memory-safe starting point", () => {
		const worker = { concurrency: 2 };
		adjustMemoryPressureTargets(
			[
				{
					name: "file-event",
					worker,
					maximumConcurrency: 6,
					activeJobs: 2,
					queuedJobs: 1_800,
				},
			],
			2 * 1024 ** 3,
			1.18 * 1024 ** 3,
		);
		expect(worker.concurrency).toBe(3);
	});

	test("does not ramp without queued work", () => {
		const worker = { concurrency: 2 };
		adjustMemoryPressureTargets(
			[
				{
					name: "file-event",
					worker,
					maximumConcurrency: 6,
					activeJobs: 2,
					queuedJobs: 0,
				},
			],
			2 * 1024 ** 3,
			0.25 * 1024 ** 3,
		);
		expect(worker.concurrency).toBe(2);
	});

	test("uses the authoritative BullMQ queue snapshot", async () => {
		const worker = { concurrency: 3 };
		await sampleMemoryPressureTargets(
			[
				{
					name: "file-event",
					worker,
					maximumConcurrency: 6,
					readJobCounts: async () => ({
						active: 3,
						waiting: 1_856,
						prioritized: 0,
					}),
				},
			],
			2 * 1024 ** 3,
			0.74 * 1024 ** 3,
		);
		expect(worker.concurrency).toBe(4);
	});

	test("fails safe when queue load cannot be read", async () => {
		const worker = { concurrency: 4 };
		const result = await sampleMemoryPressureTargets(
			[
				{
					name: "file-event",
					worker,
					maximumConcurrency: 6,
					readJobCounts: async () => {
						throw new Error("Redis unavailable");
					},
				},
			],
			2 * 1024 ** 3,
			1.84 * 1024 ** 3,
		);
		expect(worker.concurrency).toBe(1);
		expect(result.loadErrors).toHaveLength(1);
	});

	test("backs every worker off when shared cgroup pressure is high", () => {
		const fileWorker = { concurrency: 4 };
		const coverWorker = { concurrency: 2 };
		adjustMemoryPressureTargets(
			[
				{
					name: "file-event",
					worker: fileWorker,
					maximumConcurrency: 6,
					activeJobs: 4,
					queuedJobs: 1_000,
				},
				{
					name: "cover-ingest",
					worker: coverWorker,
					maximumConcurrency: 3,
					activeJobs: 2,
					queuedJobs: 100,
				},
			],
			2 * 1024 ** 3,
			1.84 * 1024 ** 3,
		);
		expect(fileWorker.concurrency).toBe(1);
		expect(coverWorker.concurrency).toBe(1);
	});
});
