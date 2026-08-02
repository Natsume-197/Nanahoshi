import { describe, expect, test } from "bun:test";
import { adjustMemoryPressureTargets } from "../memory-pressure-controller";

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
				},
			],
			2 * 1024 ** 3,
			1.18 * 1024 ** 3,
		);
		expect(worker.concurrency).toBe(3);
	});

	test("does not ramp an idle worker before real load arrives", () => {
		const worker = { concurrency: 2 };
		adjustMemoryPressureTargets(
			[
				{
					name: "file-event",
					worker,
					maximumConcurrency: 6,
					activeJobs: 0,
				},
			],
			2 * 1024 ** 3,
			0.25 * 1024 ** 3,
		);
		expect(worker.concurrency).toBe(2);
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
				},
				{
					name: "cover-ingest",
					worker: coverWorker,
					maximumConcurrency: 3,
					activeJobs: 2,
				},
			],
			2 * 1024 ** 3,
			1.84 * 1024 ** 3,
		);
		expect(fileWorker.concurrency).toBe(1);
		expect(coverWorker.concurrency).toBe(1);
	});
});
