import { useSyncExternalStore } from "react";
import {
	clampRailWidth,
	parseRailState,
	RAIL_ANIM_MS,
	RAIL_WIDTH_DEFAULT,
	type RailState,
	railDirection,
	railStateCookie,
	railWidthCookie,
	readRailState,
	readRailWidth,
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

const RAIL_WIDTH_VAR = "--rail-expanded-width";

export function getRailWidth(): number {
	return readRailWidth(document.cookie) ?? RAIL_WIDTH_DEFAULT;
}

/** Live width while dragging: a CSS variable only, no React render. */
export function previewRailWidth(width: number) {
	document.documentElement.style.setProperty(
		RAIL_WIDTH_VAR,
		`${clampRailWidth(width)}px`,
	);
}

export function commitRailWidth(width: number) {
	previewRailWidth(width);
	// biome-ignore lint/suspicious/noDocumentCookie: read by the blocking boot script in __root.tsx before first paint
	document.cookie = railWidthCookie(width);
	emit();
}

export function resetRailWidth() {
	commitRailWidth(RAIL_WIDTH_DEFAULT);
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

/** The server can't read the width cookie, so it renders without one. */
export function useRailWidth(): number | undefined {
	return useSyncExternalStore(subscribe, getRailWidth, () => undefined);
}
