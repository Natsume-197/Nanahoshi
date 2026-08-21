import type { HomeSectionStatus } from "./home-section-status";

export const HOME_PRIORITY_SECTION_COUNT = 4;
export const HOME_SECTION_BATCH_SIZE = 2;

export function getHomePrioritySectionCount(totalCount: number): number {
	return Math.min(HOME_PRIORITY_SECTION_COUNT, totalCount);
}

export function getNextHomeSectionCount(
	activeCount: number,
	totalCount: number,
): number {
	return Math.min(activeCount + HOME_SECTION_BATCH_SIZE, totalCount);
}

/**
 * Queries within a batch run in parallel, but their UI commits in layout
 * order. Empty sections do not occupy a slot and therefore do not block the
 * next populated section.
 */
export function getOrderedVisibleSectionIds<T extends string>(
	sectionIds: readonly T[],
	statuses: Partial<Record<T, HomeSectionStatus>>,
): T[] {
	const visible: T[] = [];
	for (const id of sectionIds) {
		const status = statuses[id];
		if (status === undefined || status === "loading") break;
		if (status === "populated") visible.push(id);
	}
	return visible;
}

export function getHomePrefetchDistance(viewportHeight: number): number {
	return Math.max(1200, Math.round(viewportHeight * 1.5));
}

export type ProgressiveHomePhase =
	| "waiting-for-viewport"
	| "loading"
	| "complete";

export function getProgressiveHomePhase({
	activeCount,
	totalCount,
	priorityCount,
	lastStatus,
	hasPendingDeferred,
}: {
	activeCount: number;
	totalCount: number;
	priorityCount: number;
	lastStatus?: HomeSectionStatus;
	hasPendingDeferred: boolean;
}): ProgressiveHomePhase {
	if (activeCount <= priorityCount) {
		return lastStatus === "populated" ? "waiting-for-viewport" : "loading";
	}
	if (hasPendingDeferred) return "loading";
	return activeCount >= totalCount ? "complete" : "waiting-for-viewport";
}
