import { useSyncExternalStore } from "react";

export const HOME_SECTION_IDS = [
	"continue",
	"recently-added",
	"books-for-you",
	"audiobooks-for-you",
	"popular",
	"your-collections",
	"book-series",
	"audiobook-series",
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export interface HomeSectionPreference {
	id: HomeSectionId;
	visible: boolean;
}

export const HOME_LAYOUT_STORAGE_KEY = "nanahoshi-home-layout-v1";

const LEGACY_SECTION_IDS: Partial<Record<string, HomeSectionId>> = {
	"recent-books": "recently-added",
	"recent-audiobooks": "recently-added",
	"popular-books": "popular",
	"popular-audiobooks": "popular",
	"collections-books": "your-collections",
	"collections-audiobooks": "your-collections",
};

export function getDefaultHomeLayout(): HomeSectionPreference[] {
	return HOME_SECTION_IDS.map((id) => ({ id, visible: true }));
}

/**
 * Repairs saved preferences and migrates the former per-format layouts into a
 * single home. Existing order and visibility are retained when a legacy
 * section has a direct equivalent.
 */
export function normalizeHomeLayout(value: unknown): HomeSectionPreference[] {
	const storedValue =
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		"all" in value
			? (value as { all?: unknown }).all
			: value;
	const allowed = new Set<string>(HOME_SECTION_IDS);
	const seen = new Set<HomeSectionId>();
	const normalized: HomeSectionPreference[] = [];

	if (Array.isArray(storedValue)) {
		for (const item of storedValue) {
			if (
				typeof item !== "object" ||
				item === null ||
				!("id" in item) ||
				typeof item.id !== "string"
			) {
				continue;
			}

			const mappedId = allowed.has(item.id)
				? (item.id as HomeSectionId)
				: LEGACY_SECTION_IDS[item.id];
			if (!mappedId || seen.has(mappedId)) continue;

			seen.add(mappedId);
			normalized.push({
				id: mappedId,
				visible:
					"visible" in item && typeof item.visible === "boolean"
						? item.visible
						: true,
			});
		}
	}

	for (const id of HOME_SECTION_IDS) {
		if (!seen.has(id)) normalized.push({ id, visible: true });
	}

	return normalized;
}

function readStored(): HomeSectionPreference[] {
	if (typeof window === "undefined") return getDefaultHomeLayout();

	try {
		const raw = window.localStorage.getItem(HOME_LAYOUT_STORAGE_KEY);
		return normalizeHomeLayout(raw ? JSON.parse(raw) : null);
	} catch {
		return getDefaultHomeLayout();
	}
}

const serverLayout = getDefaultHomeLayout();
let layout = readStored();
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
	listeners.add(onStoreChange);
	return () => {
		listeners.delete(onStoreChange);
	};
}

export function setHomeLayout(next: readonly HomeSectionPreference[]) {
	const normalized = normalizeHomeLayout(next);
	if (JSON.stringify(layout) === JSON.stringify(normalized)) return;

	layout = normalized;
	if (typeof window !== "undefined") {
		window.localStorage.setItem(
			HOME_LAYOUT_STORAGE_KEY,
			JSON.stringify(layout),
		);
	}
	emit();
}

export function useHomeLayout(): readonly HomeSectionPreference[] {
	return useSyncExternalStore(
		subscribe,
		() => layout,
		() => serverLayout,
	);
}
