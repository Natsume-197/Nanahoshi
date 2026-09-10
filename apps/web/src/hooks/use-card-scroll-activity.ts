import type { RefObject } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/** Keep transient card hover effects from animating under a stationary cursor. */
export function useCardScrollActivity(ref: RefObject<HTMLElement | null>) {
	useMountEffect(() => {
		const root = ref.current;
		if (!root) return;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const finish = () => {
			clearTimeout(timeout);
			root.removeAttribute("data-card-scrolling");
		};
		const scroll = () => {
			if (!root.hasAttribute("data-card-scrolling"))
				root.setAttribute("data-card-scrolling", "");
			clearTimeout(timeout);
			// Restore hover once scrolling settles, without React updates per frame.
			timeout = setTimeout(finish, 150);
		};
		// Capture includes the horizontal dashboard rails as well as the main panel.
		root.addEventListener("scroll", scroll, { capture: true, passive: true });
		return () => {
			finish();
			root.removeEventListener("scroll", scroll, true);
		};
	});
}
