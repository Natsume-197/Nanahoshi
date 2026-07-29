import { useSyncExternalStore } from "react";
import type { HomeScope } from "@/lib/home-scope-store";

export const HOME_SECTION_IDS = {
	all: [
		"continue",
		"books-for-you",
		"popular-books",
		"recent-books",
		"audiobooks-for-you",
		"popular-audiobooks",
		"recent-audiobooks",
	],
	books: [
		"continue-reading",
		"books-for-you",
		"popular-books",
		"collections-books",
		"recent-books",
		"book-series",
		"random-books",
	],
	audiobooks: [
		"continue-listening",
		"audiobooks-for-you",
		"popular-audiobooks",
		"collections-audiobooks",
		"recent-audiobooks",
		"audiobook-series",
		"random-audiobooks",
	],
} as const;

export type HomeSectionId =
	(typeof HOME_SECTION_IDS)[keyof typeof HOME_SECTION_IDS][number];

export interface HomeSectionPreference {
	id: HomeSectionId;
	visible: boolean;
}

export type HomeLayouts = Record<HomeScope, readonly HomeSectionPreference[]>;

export const HOME_LAYOUT_STORAGE_KEY = "nanahoshi-home-layout-v1";

function defaultScopeLayout(scope: HomeScope): HomeSectionPreference[] {
	return HOME_SECTION_IDS[scope].map((id) => ({ id, visible: true }));
}

export function getDefaultHomeLayout(
	scope: HomeScope,
): HomeSectionPreference[] {
	return defaultScopeLayout(scope);
}

function normalizeScopeLayout(
	scope: HomeScope,
	value: unknown,
): HomeSectionPreference[] {
	const allowed = new Set<HomeSectionId>(HOME_SECTION_IDS[scope]);
	const seen = new Set<HomeSectionId>();
	const normalized: HomeSectionPreference[] = [];

	if (Array.isArray(value)) {
		for (const item of value) {
			if (
				typeof item !== "object" ||
				item === null ||
				!("id" in item) ||
				typeof item.id !== "string" ||
				!allowed.has(item.id as HomeSectionId) ||
				seen.has(item.id as HomeSectionId)
			) {
				continue;
			}

			const id = item.id as HomeSectionId;
			seen.add(id);
			normalized.push({
				id,
				visible:
					"visible" in item && typeof item.visible === "boolean"
						? item.visible
						: true,
			});
		}
	}

	for (const id of HOME_SECTION_IDS[scope]) {
		if (!seen.has(id)) normalized.push({ id, visible: true });
	}

	return normalized;
}

export function normalizeHomeLayouts(value: unknown): HomeLayouts {
	const record =
		typeof value === "object" && value !== null
			? (value as Record<string, unknown>)
			: {};

	return {
		all: normalizeScopeLayout("all", record.all),
		books: normalizeScopeLayout("books", record.books),
		audiobooks: normalizeScopeLayout("audiobooks", record.audiobooks),
	};
}

function readStored(): HomeLayouts {
	if (typeof window === "undefined") return normalizeHomeLayouts(null);

	try {
		const raw = window.localStorage.getItem(HOME_LAYOUT_STORAGE_KEY);
		return normalizeHomeLayouts(raw ? JSON.parse(raw) : null);
	} catch {
		return normalizeHomeLayouts(null);
	}
}

const serverLayouts = normalizeHomeLayouts(null);
let layouts = readStored();
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

export function setHomeLayout(
	scope: HomeScope,
	next: readonly HomeSectionPreference[],
) {
	const normalized = normalizeScopeLayout(scope, next);
	if (JSON.stringify(layouts[scope]) === JSON.stringify(normalized)) return;

	layouts = { ...layouts, [scope]: normalized };
	if (typeof window !== "undefined") {
		window.localStorage.setItem(
			HOME_LAYOUT_STORAGE_KEY,
			JSON.stringify(layouts),
		);
	}
	emit();
}

export function useHomeLayouts(): HomeLayouts {
	return useSyncExternalStore(
		subscribe,
		() => layouts,
		() => serverLayouts,
	);
}

export function useHomeLayout(
	scope: HomeScope,
): readonly HomeSectionPreference[] {
	const current = useHomeLayouts();
	return current[scope];
}
