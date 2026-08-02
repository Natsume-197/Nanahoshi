import {
	runtimeMemoryCapacity,
	runtimeWorkerCpuBudget,
} from "@nanahoshi-v2/env/resources";
import { env } from "@nanahoshi-v2/env/server";

export function clampToCpuBudget(
	requested: number,
	budget = runtimeWorkerCpuBudget(),
): number {
	const safeRequested = Math.max(1, Math.floor(requested));
	const safeBudget = Math.max(1, Math.floor(budget));
	return Math.min(safeRequested, safeBudget);
}

export function workerConcurrency(
	maximum = Number.MAX_SAFE_INTEGER,
	budget = runtimeWorkerCpuBudget(),
): number {
	return clampToCpuBudget(maximum, budget);
}

/**
 * File jobs may spawn Calibre and image codecs, each with a sizeable native
 * working set. CPU capacity is therefore not a safe concurrency budget for
 * this queue: six parallel conversions exhausted a 1 GiB cgroup in production.
 */
export function fileEventConcurrency(
	budget = runtimeWorkerCpuBudget(),
	memoryCapacity = runtimeMemoryCapacity(),
): number {
	const memorySlots = Math.max(1, Math.floor(memoryCapacity / 1024 ** 3));
	return clampToCpuBudget(memorySlots, budget);
}

/**
 * Reduce quickly near the cgroup ceiling, hold steady in the middle, and
 * recover one slot at a time once memory is comfortably available again.
 */
export function nextConcurrencyForMemoryPressure(
	current: number,
	maximum: number,
	pressure: number,
	isSaturated = true,
): number {
	const safeCurrent = Math.max(1, Math.floor(current));
	const safeMaximum = Math.max(1, Math.floor(maximum));
	if (!Number.isFinite(pressure)) return safeCurrent;
	if (pressure >= 0.9) return 1;
	if (pressure >= 0.8) return Math.max(1, Math.floor(safeCurrent / 2));
	if (pressure <= 0.65 && isSaturated) {
		return Math.min(safeMaximum, safeCurrent + 1);
	}
	return Math.min(safeCurrent, safeMaximum);
}

export function scanStatConcurrency(
	budget = runtimeWorkerCpuBudget(),
	override = env.SCAN_STAT_CONCURRENCY,
): number {
	if (override !== undefined) return override;
	return Math.max(8, Math.floor(budget) * 16);
}

export function scanHashConcurrency(
	budget = runtimeWorkerCpuBudget(),
	override = env.SCAN_HASH_CONCURRENCY,
): number {
	if (override !== undefined) return override;
	return Math.max(4, Math.floor(budget) * 4);
}
