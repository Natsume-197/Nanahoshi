import { useRouter } from "@tanstack/react-router";
import type { RefObject } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { type AutoHideState, resolveAutoHide } from "@/lib/auto-hide-header";

/**
 * Hides the mobile top bar while scrolling down and brings it back on the way
 * up. Drives a `data-hidden` attribute rather than React state on purpose: this
 * runs on every scroll frame, and re-rendering the dashboard subtree there would
 * undo the scroll-performance work. The visual change is a CSS transform, so the
 * whole thing stays on the compositor.
 *
 * The thresholds live in `resolveAutoHide`; this only wires it to the scroll
 * container and writes the result to the DOM.
 */
export function useAutoHideHeader(
	headerRef: RefObject<HTMLElement | null>,
	scrollRef: RefObject<HTMLElement | null>,
) {
	const router = useRouter();

	useMountEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;

		let state: AutoHideState = { lastY: scroller.scrollTop, hidden: false };
		let frame: number | null = null;

		const write = (next: AutoHideState) => {
			if (next.hidden !== state.hidden) {
				// Hiding the bar while something anchored to it is open would leave
				// the popup floating over nothing. Revealing is always allowed.
				if (
					next.hidden &&
					headerRef.current?.querySelector('[aria-expanded="true"]')
				) {
					state = { ...next, hidden: state.hidden };
					return;
				}
				headerRef.current?.setAttribute("data-hidden", String(next.hidden));
			}
			state = next;
		};

		const measure = () => {
			frame = null;
			const el = scrollRef.current;
			if (el) write(resolveAutoHide(state, el.scrollTop));
		};

		// Coalesce to one read per frame — scroll events can outpace paint, and
		// reading scrollTop more than once per frame buys nothing.
		const onScroll = () => {
			if (frame == null) frame = requestAnimationFrame(measure);
		};

		scroller.addEventListener("scroll", onScroll, { passive: true });

		// A new page arrives at its own offset, so a bar left hidden from the
		// previous page would stay gone until the user happened to scroll up.
		const unsubscribe = router.subscribe("onBeforeNavigate", () => {
			write({ lastY: 0, hidden: false });
		});

		return () => {
			if (frame != null) cancelAnimationFrame(frame);
			scroller.removeEventListener("scroll", onScroll);
			unsubscribe();
		};
	});
}
