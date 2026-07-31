import type { RefObject } from "react";
import { useRef } from "react";
import {
	blendVelocity,
	DRAG_THRESHOLD_PX,
	releaseDuration,
	sheetOffset,
	shouldDismissSheet,
} from "@/components/audio-player/sheet-drag";

/** Controls and scrollers that own the vertical gesture where they sit. */
const IGNORE_SELECTOR =
	'button, a, input, [role="slider"], [data-sheet-ignore]';

type Drag = {
	pointerId: number;
	startX: number;
	startY: number;
	/** Where the panel was when grabbed, so an open still in flight is caught. */
	base: number;
	lastY: number;
	lastTime: number;
	velocity: number;
	active: boolean;
};

/** Inline styles outrank the global reduced-motion reset, so ask for it here. */
function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function currentOffset(el: HTMLElement): number {
	const { transform } = getComputedStyle(el);
	if (!transform || transform === "none") return 0;
	return new DOMMatrixReadOnly(transform).m42;
}

/**
 * Drag-to-dismiss for the expanded player: the panel tracks the finger 1:1,
 * then hands its velocity to the settle. Touch only, so desktop is untouched.
 *
 * The transform is written straight to the node — a re-render per frame of a
 * tree this size would never keep up with a finger.
 */
export function useSheetDrag({
	panelRef,
	enabled,
	onDismiss,
}: {
	panelRef: RefObject<HTMLDivElement | null>;
	enabled: boolean;
	onDismiss: () => void;
}) {
	const dragRef = useRef<Drag | null>(null);

	const clearInlineStyles = () => {
		const el = panelRef.current;
		if (!el) return;
		el.style.transition = "";
		el.style.transform = "";
		el.style.willChange = "";
	};

	const settle = (el: HTMLElement, to: number, velocity: number) => {
		const from = currentOffset(el);
		dragRef.current = null;
		// Handing the panel back to its classes lands it on the target with no
		// animation — which is also what reduced motion wants.
		if (Math.abs(to - from) < 0.5 || prefersReducedMotion()) {
			clearInlineStyles();
			return;
		}
		el.style.transition = `transform ${releaseDuration(to - from, velocity)}ms var(--ease-smooth-out)`;
		el.style.transform = `translate3d(0, ${to}px, 0)`;
	};

	return {
		/** Call from the panel's own transform transitionend. */
		clearInlineStyles,

		onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
			if (!enabled || dragRef.current) return;
			if (event.pointerType === "mouse") return;
			if (
				event.target instanceof Element &&
				event.target.closest(IGNORE_SELECTOR)
			) {
				return;
			}
			const el = panelRef.current;
			if (!el) return;

			dragRef.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				base: currentOffset(el),
				lastY: event.clientY,
				lastTime: event.timeStamp,
				velocity: 0,
				active: false,
			};
		},

		onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			const el = panelRef.current;
			if (!drag || !el || drag.pointerId !== event.pointerId) return;

			const travel = event.clientY - drag.startY;

			if (!drag.active) {
				const sideways = Math.abs(event.clientX - drag.startX);
				if (
					Math.abs(travel) < DRAG_THRESHOLD_PX &&
					sideways < DRAG_THRESHOLD_PX
				)
					return;
				// Sideways or upwards is somebody else's gesture.
				if (sideways > Math.abs(travel) || travel <= 0) {
					dragRef.current = null;
					return;
				}
				drag.active = true;
				el.setPointerCapture(event.pointerId);
				el.style.transition = "none";
				el.style.willChange = "transform";
			}

			const elapsed = event.timeStamp - drag.lastTime;
			if (elapsed > 0) {
				drag.velocity = blendVelocity(
					drag.velocity,
					(event.clientY - drag.lastY) / elapsed,
				);
				drag.lastY = event.clientY;
				drag.lastTime = event.timeStamp;
			}

			el.style.transform = `translate3d(0, ${sheetOffset(drag.base + travel)}px, 0)`;
		},

		onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			const el = panelRef.current;
			if (!drag || !el || drag.pointerId !== event.pointerId) return;
			if (!drag.active) {
				dragRef.current = null;
				return;
			}
			el.releasePointerCapture(event.pointerId);

			const offset = currentOffset(el);
			const height = el.getBoundingClientRect().height;
			if (shouldDismissSheet(offset, drag.velocity, height)) {
				settle(el, height, drag.velocity);
				onDismiss();
			} else {
				settle(el, 0, drag.velocity);
			}
		},

		onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			const el = panelRef.current;
			if (!drag || !el || drag.pointerId !== event.pointerId) return;
			if (drag.active) settle(el, 0, 0);
			else dragRef.current = null;
		},
	};
}
