// Live theme preview: applies palette vars while the user drags the editor's
// color pickers. Updates are coalesced to one per animation frame, and
// `transition-colors` is suppressed for the duration of the burst (rule in
// index.css) so each frame costs a single style recalc instead of hundreds of
// independent color transitions. Nothing is persisted — commit stays on the
// Apply button.
import { applyPaletteVars, type PaletteBase } from "./theme-palettes";

interface PreviewFrame {
	base: PaletteBase;
	vars: Record<string, string>;
}

// How long after the last frame transitions are re-enabled. Long enough to
// span picker-drag event gaps, short enough to feel instant when released.
const BURST_IDLE_MS = 200;

let rafId: number | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let pendingBuild: (() => PreviewFrame) | null = null;

/**
 * Schedule a preview for the next animation frame. `build` is deferred so
 * rapid-fire picker events only pay for the palette derivation once per frame.
 */
export function previewTheme(build: () => PreviewFrame) {
	pendingBuild = build;
	if (rafId !== null) return;
	rafId = requestAnimationFrame(() => {
		rafId = null;
		const frame = pendingBuild?.();
		pendingBuild = null;
		if (!frame) return;
		const root = document.documentElement;
		root.classList.add("theme-changing");
		root.classList.toggle("dark", frame.base === "dark");
		applyPaletteVars(frame.vars);
		if (idleTimer !== null) clearTimeout(idleTimer);
		idleTimer = setTimeout(endBurst, BURST_IDLE_MS);
	});
}

function endBurst() {
	idleTimer = null;
	// Flush styles so re-enabled transitions can't animate from stale colors.
	void window.getComputedStyle(document.body).opacity;
	document.documentElement.classList.remove("theme-changing");
}

/** Drop any scheduled preview frame and re-enable transitions. */
export function cancelThemePreview() {
	if (rafId !== null) cancelAnimationFrame(rafId);
	rafId = null;
	pendingBuild = null;
	if (idleTimer !== null) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
	document.documentElement.classList.remove("theme-changing");
}
