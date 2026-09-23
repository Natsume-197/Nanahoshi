/**
 * The user's arrangement of the rail's Colecciones list, synced through
 * user settings. Keys are entry keys ("shelf-reading", "collection-<uuid>");
 * one blob spans every server, so keys this server doesn't show are kept.
 */
export interface RailLibraryLayout {
	order: string[];
	pinned: string[];
}

export const RAIL_LIBRARY_LAYOUT_KEY = "rail-library-layout";

// Deleted collections are never pruned, so bound the blob.
const MAX_KEYS = 500;

export const emptyRailLibraryLayout: RailLibraryLayout = {
	order: [],
	pinned: [],
};

function keyList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const keys = value.filter((key): key is string => typeof key === "string");
	return [...new Set(keys)].slice(0, MAX_KEYS);
}

export function normalizeRailLibraryLayout(value: unknown): RailLibraryLayout {
	if (typeof value !== "object" || value === null) {
		return emptyRailLibraryLayout;
	}
	const record = value as Record<string, unknown>;
	return { order: keyList(record.order), pinned: keyList(record.pinned) };
}

/**
 * Splits entries (given in their default order) into the pinned group and the
 * rest, each following the saved order. Entries the layout has never seen,
 * such as a collection made since, lead their group, as the newest thing.
 */
export function arrangeRailEntries<T extends { key: string }>(
	entries: T[],
	layout: RailLibraryLayout,
): { pinned: T[]; rest: T[] } {
	const rank = new Map(layout.order.map((key, index) => [key, index]));
	const pinnedKeys = new Set(layout.pinned);
	const ranked = entries
		.map((entry, index) => ({
			entry,
			rank: rank.get(entry.key) ?? -entries.length + index,
		}))
		.sort((a, b) => a.rank - b.rank)
		.map(({ entry }) => entry);
	return {
		pinned: ranked.filter((entry) => pinnedKeys.has(entry.key)),
		rest: ranked.filter((entry) => !pinnedKeys.has(entry.key)),
	};
}

/** Saves `visible` as the order, keeping keys other servers own after it. */
function withVisibleOrder(
	layout: RailLibraryLayout,
	visible: string[],
): string[] {
	const shown = new Set(visible);
	return [...visible, ...layout.order.filter((key) => !shown.has(key))].slice(
		0,
		MAX_KEYS,
	);
}

/** `visible` is the list as shown, pinned group first. */
export function moveRailEntry(
	layout: RailLibraryLayout,
	visible: string[],
	activeKey: string,
	overKey: string,
): RailLibraryLayout {
	const from = visible.indexOf(activeKey);
	const to = visible.indexOf(overKey);
	if (from < 0 || to < 0 || from === to) return layout;
	const next = [...visible];
	next.splice(from, 1);
	next.splice(to, 0, activeKey);
	return { ...layout, order: withVisibleOrder(layout, next) };
}

/** Pinning or unpinning puts the entry at the top of the group it joins. */
export function toggleRailPin(
	layout: RailLibraryLayout,
	visible: string[],
	key: string,
): RailLibraryLayout {
	const pinned = layout.pinned.includes(key)
		? layout.pinned.filter((pinnedKey) => pinnedKey !== key)
		: [key, ...layout.pinned].slice(0, MAX_KEYS);
	const order = withVisibleOrder(layout, [
		key,
		...visible.filter((visibleKey) => visibleKey !== key),
	]);
	return { order, pinned };
}
