/**
 * In-memory restoration state keyed by history entry, so back/forward returns
 * to the exact spot (page scroll, carousel offsets, list sort/filters) without
 * enabling the router's global scroll tracking. Everything is session-scoped:
 * a reload starts clean, like a fresh visit.
 */

export type RestorableLocation = {
	href: string;
	state: {
		__TSR_key?: string;
		key?: string;
		__TSR_index?: number;
	};
};

export const getLocationRestoreKey = (location: RestorableLocation) =>
	location.state.__TSR_key ??
	location.state.key ??
	(typeof location.state.__TSR_index === "number"
		? `${location.state.__TSR_index}:${location.href}`
		: location.href);

/**
 * Key of the location whose page is actually on screen. During a pending
 * navigation the router's `location` already points at the target while the
 * old page still renders; `resolvedLocation` only advances once the new page
 * commits. Keying the restorer off plain `location` remounts it early and
 * scrolls the still-visible old page to top.
 */
export const getRenderedLocationRestoreKey = (state: {
	resolvedLocation?: RestorableLocation;
	location: RestorableLocation;
}) => getLocationRestoreKey(state.resolvedLocation ?? state.location);

/**
 * Remount epoch for the scroll restorer. Two triggers, both needed:
 *
 * - Leaf match id: flips in the exact commit that swaps the routed content
 *   (store updates commit synchronously), so the restore runs pre-paint on
 *   both cold and cached navigations. `resolvedLocation` alone is too late —
 *   it advances behind a React transition lane, and the swap commit paints
 *   first (visible top→position jump on back-nav).
 * - Resolved key: covers same-route navigations where the leaf id doesn't
 *   change, and is never early (it only advances after the page commits).
 *
 * The location to restore for must be read from `router.latestLocation` at
 * mount — it already points at the target in both commits, while
 * `resolvedLocation` is still the old page during the swap commit.
 */
export const getScrollRestoreEpoch = (state: {
	matches: ReadonlyArray<{ id: string }>;
	resolvedLocation?: RestorableLocation;
	location: RestorableLocation;
}) => {
	const leafMatchId = state.matches[state.matches.length - 1]?.id ?? "";
	return `${leafMatchId}::${getRenderedLocationRestoreKey(state)}`;
};

const MAX_ENTRIES = 200;

// Insertion-ordered Map as a small LRU: re-setting a key moves it to the
// tail, overflow evicts the head, so long sessions stay bounded.
function boundedSet<V>(map: Map<string, V>, key: string, value: V) {
	if (map.has(key)) map.delete(key);
	map.set(key, value);
	if (map.size > MAX_ENTRIES) {
		const oldest = map.keys().next().value;
		if (oldest !== undefined) map.delete(oldest);
	}
}

const pagePositions = new Map<string, number>();
const railPositions = new Map<string, number>();
const uiSnapshots = new Map<string, unknown>();

/** Vertical scroll of the dashboard <main>, keyed by history entry. */
export const pageScroll = {
	get: (locationKey: string) => pagePositions.get(locationKey),
	has: (locationKey: string) => pagePositions.has(locationKey),
	set: (locationKey: string, top: number) =>
		boundedSet(pagePositions, locationKey, top),
};

/** Horizontal offset of a carousel rail, keyed by history entry + rail id. */
export const railScroll = {
	get: (locationKey: string, railId: string) =>
		railPositions.get(`${locationKey}:${railId}`),
	set: (locationKey: string, railId: string, left: number) =>
		boundedSet(railPositions, `${locationKey}:${railId}`, left),
};

/**
 * Arbitrary per-page UI state (sort, filters…) keyed by history entry, so a
 * back-nav re-creates the exact query key whose pages are already cached —
 * otherwise the list re-renders with defaults, its height collapses, and the
 * scroll restore lands short.
 */
export function saveUiSnapshot(key: string, value: unknown) {
	boundedSet(uiSnapshots, key, value);
}

export function readUiSnapshot<T>(key: string): T | undefined {
	return uiSnapshots.get(key) as T | undefined;
}
