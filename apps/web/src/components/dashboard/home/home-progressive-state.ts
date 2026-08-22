import { useCallback, useSyncExternalStore } from "react";
import type { HomeSectionId } from "@/lib/home-layout-store";
import { readUiSnapshot, saveUiSnapshot } from "@/lib/scroll-restoration";
import type { HomeSectionStatus } from "./home-section-status";
import {
	getNextHomeSectionCount,
	HOME_PRIORITY_SECTION_COUNT,
} from "./progressive-home-sections";

export type HomeProgressiveSnapshot = Readonly<{
	rawActiveCount: number;
	statuses: Partial<Record<HomeSectionId, HomeSectionStatus>>;
}>;

const DEFAULT_SNAPSHOT: HomeProgressiveSnapshot = {
	rawActiveCount: HOME_PRIORITY_SECTION_COUNT,
	statuses: {},
};
const listeners = new Map<string, Set<() => void>>();

const snapshotKey = (locationKey: string) =>
	`${locationKey}:dashboard-home-progressive`;

export function getHomeProgressiveSnapshot(
	locationKey: string,
): HomeProgressiveSnapshot {
	return (
		readUiSnapshot<HomeProgressiveSnapshot>(snapshotKey(locationKey)) ??
		DEFAULT_SNAPSHOT
	);
}

function updateSnapshot(
	locationKey: string,
	update: (current: HomeProgressiveSnapshot) => HomeProgressiveSnapshot,
) {
	const current = getHomeProgressiveSnapshot(locationKey);
	const next = update(current);
	if (next === current) return;

	saveUiSnapshot(snapshotKey(locationKey), next);
	for (const listener of listeners.get(locationKey) ?? []) listener();
}

export function reportHomeSectionStatus(
	locationKey: string,
	id: HomeSectionId,
	status: HomeSectionStatus,
) {
	updateSnapshot(locationKey, (current) =>
		current.statuses[id] === status
			? current
			: { ...current, statuses: { ...current.statuses, [id]: status } },
	);
}

/**
 * `fromCount` is the count actually rendered, which can already exceed the raw
 * count when empty sections were backfilled. Advancing from the raw count there
 * would reveal nothing and permanently stall the reveal.
 */
export function revealNextHomeSectionBatch(
	locationKey: string,
	totalCount: number,
	fromCount = 0,
) {
	updateSnapshot(locationKey, (current) => {
		const rawActiveCount = getNextHomeSectionCount(
			Math.max(current.rawActiveCount, fromCount),
			totalCount,
		);
		return rawActiveCount === current.rawActiveCount
			? current
			: { ...current, rawActiveCount };
	});
}

function subscribe(locationKey: string, listener: () => void) {
	const locationListeners = listeners.get(locationKey) ?? new Set();
	locationListeners.add(listener);
	listeners.set(locationKey, locationListeners);
	return () => {
		locationListeners.delete(listener);
		if (locationListeners.size === 0) listeners.delete(locationKey);
	};
}

export function useHomeProgressiveSnapshot(locationKey: string) {
	const subscribeToLocation = useCallback(
		(listener: () => void) => subscribe(locationKey, listener),
		[locationKey],
	);
	const readLocationSnapshot = useCallback(
		() => getHomeProgressiveSnapshot(locationKey),
		[locationKey],
	);
	return useSyncExternalStore(
		subscribeToLocation,
		readLocationSnapshot,
		() => DEFAULT_SNAPSHOT,
	);
}
