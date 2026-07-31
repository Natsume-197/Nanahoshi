import { env } from "@nanahoshi-v2/env/server";

export function clampToWorkerBudget(
	requested: number,
	budget = env.WORKER_CONCURRENCY ?? 2,
): number {
	const safeRequested = Math.max(1, Math.floor(requested));
	const safeBudget = Math.max(1, Math.floor(budget));
	return Math.min(safeRequested, safeBudget);
}

export function workerConcurrency(maximum = Number.MAX_SAFE_INTEGER): number {
	return clampToWorkerBudget(maximum);
}

export function scanStatConcurrency(
	budget = env.WORKER_CONCURRENCY ?? 2,
): number {
	return Math.max(8, Math.floor(budget) * 16);
}

export function scanHashConcurrency(
	budget = env.WORKER_CONCURRENCY ?? 2,
): number {
	return Math.max(4, Math.floor(budget) * 4);
}
