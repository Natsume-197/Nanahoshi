export type ActiveCueFollowMode = "following" | "suspended";
export type ActiveCueFollowStrategy = "comfort" | "visibility";

export type ActiveCueAxisRange = {
	start: number;
	end: number;
};

export type ActiveCueFollowDecision = {
	scroll: boolean;
	showResume: boolean;
};

const COMFORT_START_RATIO = 0.22;
const COMFORT_END_RATIO = 0.72;

/**
 * Keeps narration inside a stable reading band instead of centering every cue.
 * Insets remove fixed reader chrome from the usable viewport.
 */
export function resolveActiveCueFollowDecision({
	mode,
	strategy = "comfort",
	force = false,
	cue,
	viewport,
	startInset = 0,
	endInset = 0,
}: {
	mode: ActiveCueFollowMode;
	strategy?: ActiveCueFollowStrategy;
	force?: boolean;
	cue: ActiveCueAxisRange;
	viewport: ActiveCueAxisRange;
	startInset?: number;
	endInset?: number;
}): ActiveCueFollowDecision {
	if (mode === "suspended") return { scroll: false, showResume: true };
	if (force) return { scroll: true, showResume: false };

	const usableStart = Math.min(viewport.end, viewport.start + startInset);
	const usableEnd = Math.max(usableStart, viewport.end - endInset);
	const usableSize = Math.max(1, usableEnd - usableStart);
	const comfortStart = usableStart + usableSize * COMFORT_START_RATIO;
	const comfortEnd = usableStart + usableSize * COMFORT_END_RATIO;
	const cueCenter = (cue.start + cue.end) / 2;
	const fullyVisible = cue.start >= usableStart && cue.end <= usableEnd;

	return {
		scroll:
			!fullyVisible ||
			(strategy === "comfort" &&
				(cueCenter < comfortStart || cueCenter > comfortEnd)),
		showResume: false,
	};
}

const READER_TEXT_SELECTOR = ".book-content, .book-content-container";
const INTERACTIVE_SELECTOR =
	'button,a,input,select,textarea,[contenteditable="true"],[role="button"]';
const NAVIGATION_KEYS = new Set([
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"End",
	"Home",
	"PageDown",
	"PageUp",
	" ",
]);

function eventElement(
	surface: HTMLElement,
	target: EventTarget | null,
): Element | null {
	const ElementConstructor = surface.ownerDocument.defaultView?.Element;
	return ElementConstructor && target instanceof ElementConstructor
		? (target as Element)
		: null;
}

function isReaderTextEvent(surface: HTMLElement, target: EventTarget | null) {
	const element = eventElement(surface, target);
	return (
		element !== null &&
		surface.contains(element) &&
		Boolean(element.closest(READER_TEXT_SELECTOR))
	);
}

/** Binds user intent, not scroll events, so programmatic following never pauses itself. */
export function bindReadListenManualFollowPause({
	surface,
	onPause,
}: {
	surface: HTMLElement;
	onPause: () => void;
}): () => void {
	let paused = false;
	const pause = () => {
		if (paused) return;
		paused = true;
		onPause();
	};
	const onPointerMove = (event: PointerEvent) => {
		if (
			event.buttons === 1 &&
			(event.movementX !== 0 || event.movementY !== 0) &&
			isReaderTextEvent(surface, event.target)
		) {
			pause();
		}
	};
	const onWheel = (event: WheelEvent) => {
		if (isReaderTextEvent(surface, event.target)) pause();
	};
	const onTouchMove = (event: TouchEvent) => {
		if (isReaderTextEvent(surface, event.target)) pause();
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (
			event.defaultPrevented ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			!NAVIGATION_KEYS.has(event.key)
		) {
			return;
		}
		const target = eventElement(surface, event.target);
		if (target?.closest(INTERACTIVE_SELECTOR)) {
			return;
		}
		pause();
	};

	surface.addEventListener("pointermove", onPointerMove, { passive: true });
	surface.addEventListener("wheel", onWheel, { passive: true });
	surface.addEventListener("touchmove", onTouchMove, { passive: true });
	surface.ownerDocument.addEventListener("keydown", onKeyDown, true);
	return () => {
		surface.removeEventListener("pointermove", onPointerMove);
		surface.removeEventListener("wheel", onWheel);
		surface.removeEventListener("touchmove", onTouchMove);
		surface.ownerDocument.removeEventListener("keydown", onKeyDown, true);
	};
}
