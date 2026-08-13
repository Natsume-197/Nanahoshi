import type { ReadListenTimelineCue } from "@/lib/read-listen/timeline";

/**
 * Text quotes are self-contained. Fragment anchors remain in the synchronized
 * sequence but need the ebook DOM, so the player gives them an honest reader
 * fallback instead of silently dropping the active interval.
 */
export function getReadListenCueDisplayText(
	cue: ReadListenTimelineCue,
): string | null {
	return cue.text.kind === "text-quote" ? cue.text.exact : null;
}

/** Lets the first and last cues reach the viewport's visual center. */
export function getReadListenTextEdgePadding(viewportHeight: number): number {
	return Math.max(0, Math.ceil(viewportHeight / 2));
}

export function getReadListenManualScrollDelta({
	key,
	viewportHeight,
}: {
	key: string;
	viewportHeight: number;
}): number | "start" | "end" | null {
	if (key === "ArrowUp") return -64;
	if (key === "ArrowDown") return 64;
	if (key === "PageUp") return -Math.max(64, viewportHeight * 0.8);
	if (key === "PageDown") return Math.max(64, viewportHeight * 0.8);
	if (key === "Home") return "start";
	if (key === "End") return "end";
	return null;
}

type ReadListenScrollableViewport = Pick<
	HTMLElement,
	"clientHeight" | "focus" | "scrollBy" | "scrollHeight" | "scrollTo"
>;

/** Moves the focusable text viewport and reports whether the key was handled. */
export function scrollReadListenTextByKey({
	key,
	viewport,
}: {
	key: string;
	viewport: ReadListenScrollableViewport;
}): boolean {
	const movement = getReadListenManualScrollDelta({
		key,
		viewportHeight: viewport.clientHeight,
	});
	if (movement === null) return false;
	viewport.focus({ preventScroll: true });
	if (movement === "start") viewport.scrollTo({ top: 0, behavior: "auto" });
	else if (movement === "end") {
		viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
	} else viewport.scrollBy({ top: movement, behavior: "auto" });
	return true;
}

export function isReadListenManualScrollKey(key: string): boolean {
	return ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
		key,
	);
}
