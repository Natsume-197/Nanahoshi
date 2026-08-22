import type { HomeSectionStatus } from "./home-section-status";

export const HOME_PRIORITY_SECTION_COUNT = 4;
export const HOME_SECTION_BATCH_SIZE = 3;

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
 * Empty sections render nothing, so the first viewport would be short by one
 * rail for each of them. Pulling deferred sections forward backfills the gap.
 */
export function getActiveHomeSectionCount<T extends string>({
	sectionIds,
	statuses,
	rawActiveCount,
	priorityCount,
}: {
	sectionIds: readonly T[];
	statuses: Partial<Record<T, HomeSectionStatus>>;
	rawActiveCount: number;
	priorityCount: number;
}): number {
	const emptyPriorityCount = sectionIds
		.slice(0, priorityCount)
		.reduce((count, id) => count + (statuses[id] === "empty" ? 1 : 0), 0);
	return Math.min(
		Math.max(rawActiveCount, priorityCount, priorityCount + emptyPriorityCount),
		sectionIds.length,
	);
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

/** Empty wrappers must not participate in the home section stack's flex gap. */
export function getProgressiveHomeSectionHidden(
	deferred: boolean,
	populated: boolean,
	status: HomeSectionStatus | undefined,
): boolean {
	return status === "empty" || (deferred && !populated);
}

type HomePrefetchEnvironment = {
	effectiveType?: string;
	saveData?: boolean;
	scrollVelocity?: number;
};

export function getHomePrefetchDistance(
	viewportHeight: number,
	{ effectiveType, saveData, scrollVelocity = 0 }: HomePrefetchEnvironment = {},
): number {
	if (saveData) return Math.max(800, Math.round(viewportHeight));
	let baseDistance: number;
	let maxVelocityLookahead: number;
	if (effectiveType === "slow-2g" || effectiveType === "2g") {
		baseDistance = Math.max(1000, Math.round(viewportHeight * 1.25));
		maxVelocityLookahead = viewportHeight * 0.5;
	} else if (effectiveType === "3g") {
		baseDistance = Math.max(2000, Math.round(viewportHeight * 2.5));
		maxVelocityLookahead = viewportHeight * 1.5;
	} else {
		baseDistance = Math.max(3200, Math.round(viewportHeight * 4));
		maxVelocityLookahead = viewportHeight * 3;
	}
	// px/ms × 1000ms estimates how far the user will travel in the next second.
	const velocityLookahead = Math.min(
		maxVelocityLookahead,
		Math.max(0, scrollVelocity) * 1000,
	);
	return Math.round(baseDistance + velocityLookahead);
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
