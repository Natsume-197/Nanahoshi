import { describe, expect, test } from "bun:test";
import {
	cpuCapacityFrom,
	memoryCapacityFrom,
	workerCpuBudgetFromCapacity,
} from "@nanahoshi-v2/env/resources";
import {
	clampToCpuBudget,
	fileEventConcurrency,
	nextConcurrencyForMemoryPressure,
	scanHashConcurrency,
	scanStatConcurrency,
	workerConcurrency,
} from "../worker-budget";

describe("worker resource budget", () => {
	test("uses most host CPUs while reserving capacity for interactive work", () => {
		expect(workerCpuBudgetFromCapacity(8)).toBe(6);
		expect(workerCpuBudgetFromCapacity(4)).toBe(3);
		expect(workerCpuBudgetFromCapacity(2)).toBe(1);
		expect(workerCpuBudgetFromCapacity(1)).toBe(1);
	});

	test("honors cgroup v2 and v1 CPU ceilings", () => {
		expect(
			cpuCapacityFrom({
				parallelism: 8,
				cgroupV2CpuMax: "200000 100000",
			}),
		).toBe(2);
		expect(
			cpuCapacityFrom({
				parallelism: 8,
				cgroupV2CpuMax: "max 100000",
				cgroupV1Quota: "300000",
				cgroupV1Period: "100000",
			}),
		).toBe(3);
	});

	test("caps requested concurrency with the dynamic CPU budget", () => {
		expect(clampToCpuBudget(20, 6)).toBe(6);
		expect(clampToCpuBudget(1, 6)).toBe(1);
		expect(clampToCpuBudget(0, 0)).toBe(1);
		expect(workerConcurrency(20, 6)).toBe(6);
	});

	test("scales memory-heavy file processing with the cgroup budget", () => {
		const gib = 1024 ** 3;
		expect(fileEventConcurrency(6, gib)).toBe(1);
		expect(fileEventConcurrency(6, 2 * gib)).toBe(2);
		expect(fileEventConcurrency(6, 4 * gib)).toBe(4);
		expect(fileEventConcurrency(1, 4 * gib)).toBe(1);
	});

	test("resolves memory capacity from host and cgroup ceilings", () => {
		const gib = 1024 ** 3;
		expect(
			memoryCapacityFrom({
				systemBytes: 16 * gib,
				cgroupV2MemoryMax: String(2 * gib),
			}),
		).toBe(2 * gib);
		expect(
			memoryCapacityFrom({
				systemBytes: 16 * gib,
				cgroupV2MemoryMax: "max",
				cgroupV1MemoryLimit: String(4 * gib),
			}),
		).toBe(4 * gib);
	});

	test("backs off quickly and recovers gradually with hysteresis", () => {
		expect(nextConcurrencyForMemoryPressure(4, 6, 0.91)).toBe(1);
		expect(nextConcurrencyForMemoryPressure(4, 6, 0.82)).toBe(2);
		expect(nextConcurrencyForMemoryPressure(2, 6, 0.72)).toBe(2);
		expect(nextConcurrencyForMemoryPressure(2, 6, 0.6)).toBe(3);
	});

	test("derives bounded scan I/O concurrency", () => {
		expect(scanStatConcurrency(6)).toBe(96);
		expect(scanHashConcurrency(6)).toBe(24);
		expect(scanStatConcurrency(1)).toBe(16);
		expect(scanHashConcurrency(1)).toBe(4);
	});

	test("uses explicit scan I/O concurrency overrides", () => {
		expect(scanStatConcurrency(2, 7)).toBe(7);
		expect(scanHashConcurrency(2, 3)).toBe(3);
	});
});
