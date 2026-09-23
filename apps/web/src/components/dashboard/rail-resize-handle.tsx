import {
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useRef,
	useSyncExternalStore,
} from "react";
import {
	RAIL_WIDTH_KEY_STEP,
	RAIL_WIDTH_MAX,
	RAIL_WIDTH_MIN,
	resolveRailDrag,
} from "@/lib/rail-state";
import {
	commitRailWidth,
	getRailWidth,
	previewRailWidth,
	resetRailWidth,
	setRailState,
	useRailState,
	useRailWidth,
} from "@/lib/rail-store";
import { m } from "@/paraglide/messages";

const noopSubscribe = () => () => {};

/**
 * Drag handle over the seam between the rail and the content panel. Dragging
 * resizes the expanded rail, past the threshold it snaps shut or open, and a
 * double-click restores the default width.
 */
export function RailResizeHandle(): ReactNode {
	const railState = useRailState();
	const railWidth = useRailWidth();
	const drag = useRef<{ railLeft: number; width: number | null } | null>(null);
	// Client-only: the width comes from a cookie the server render never sees,
	// and hydration won't patch a mismatched aria-valuenow.
	const hydrated = useSyncExternalStore(
		noopSubscribe,
		() => true,
		() => false,
	);

	const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		const rail = event.currentTarget.closest("[data-app-rail]");
		if (!rail) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { railLeft: rail.getBoundingClientRect().left, width: null };
		document.documentElement.setAttribute("data-rail-resizing", "");
	};

	const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
		if (!drag.current) return;
		const next = resolveRailDrag(event.clientX - drag.current.railLeft);
		if (next.state === "collapsed") {
			setRailState("collapsed");
			return;
		}
		previewRailWidth(next.width);
		setRailState("expanded");
		drag.current.width = next.width;
	};

	const endDrag = () => {
		if (!drag.current) return;
		if (drag.current.width !== null) commitRailWidth(drag.current.width);
		drag.current = null;
		document.documentElement.removeAttribute("data-rail-resizing");
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step =
			event.key === "ArrowRight"
				? RAIL_WIDTH_KEY_STEP
				: event.key === "ArrowLeft"
					? -RAIL_WIDTH_KEY_STEP
					: 0;
		if (!step) return;
		event.preventDefault();
		if (railState === "collapsed") {
			if (step > 0) setRailState("expanded");
			return;
		}
		const next = getRailWidth() + step;
		if (next < RAIL_WIDTH_MIN) {
			setRailState("collapsed");
			return;
		}
		commitRailWidth(next);
	};

	if (!hydrated) return null;
	return (
		// biome-ignore lint/a11y/useSemanticElements: a focusable, draggable window splitter; <hr> can't take focus or pointer input
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={m["nav.resize_rail"]()}
			aria-valuemin={RAIL_WIDTH_MIN}
			aria-valuemax={RAIL_WIDTH_MAX}
			aria-valuenow={railState === "expanded" ? railWidth : undefined}
			tabIndex={0}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onLostPointerCapture={endDrag}
			onDoubleClick={() => {
				resetRailWidth();
				setRailState("expanded");
			}}
			onKeyDown={handleKeyDown}
			// Straddles the gap up to the content panel's border, so grabbing
			// the visible line works.
			className="group/resize absolute inset-y-0 left-full z-20 w-4 -translate-x-1 cursor-col-resize touch-none outline-none"
		>
			<span className="absolute inset-y-0 left-3 w-0.5 bg-sidebar-foreground/40 opacity-0 transition-opacity duration-150 group-hover/resize:opacity-100 group-hover/resize:delay-150 group-focus-visible/resize:opacity-100 group-active/resize:opacity-100" />
		</div>
	);
}
