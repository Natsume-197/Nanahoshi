import { runtimeWorkerCpuBudget } from "@nanahoshi-v2/env/resources";
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
