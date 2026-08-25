import { useSyncExternalStore } from "react";
import {
	parseRailState,
	RAIL_ANIM_MS,
	type RailState,
	railDirection,
	railStateCookie,
	readRailState,
} from "@/lib/rail-state";

const listeners = new Set<() => void>();
let cached: RailState | null = null;

function emit() {
	for (const listener of listeners) listener();
}

function getSnapshot(): RailState {
	if (cached === null) {
		const attribute = document.documentElement.getAttribute("data-rail");
		cached = attribute
			? parseRailState(attribute)
			: readRailState(document.cookie);
	}
	return cached;
}

let animTimer: ReturnType<typeof setTimeout> | null = null;

export function setRailState(next: RailState) {
	if (getSnapshot() === next) return;
	cached = next;
	const root = document.documentElement;
	root.setAttribute("data-rail-anim", railDirection(next));
	if (animTimer) clearTimeout(animTimer);
	animTimer = setTimeout(() => {
		animTimer = null;
		root.removeAttribute("data-rail-anim");
	}, RAIL_ANIM_MS);
	root.setAttribute("data-rail", next);
	// biome-ignore lint/suspicious/noDocumentCookie: must be synchronous — the blocking boot script in __root.tsx reads this cookie before first paint
	document.cookie = railStateCookie(next);
	emit();
}

export function toggleRail() {
	setRailState(getSnapshot() === "expanded" ? "collapsed" : "expanded");
}

function subscribe(onStoreChange: () => void) {
	listeners.add(onStoreChange);
	return () => {
		listeners.delete(onStoreChange);
	};
}

export function useRailState(): RailState {
	return useSyncExternalStore(subscribe, getSnapshot, () => "expanded");
}
