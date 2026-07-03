import { useSyncExternalStore } from "react";

// Lets a detail page hand its artwork backdrop (dominant color + cover) to the
// layout, which paints it as one continuous surface behind BOTH the sticky
// header and the hero — so the navbar and the hero wash blend seamlessly instead
// of meeting at a seam. The page publishes on mount and clears on unmount.
// null on every other route (and during SSR), so the header stays plain.
export type HeroBackdropPayload = {
	accent: string | null;
	coverUrl: string | null;
	coverSrcSet?: string;
};

let payload: HeroBackdropPayload | null = null;
const listeners = new Set<() => void>();

export function setHeroBackdrop(value: HeroBackdropPayload | null) {
	payload = value;
	for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
	listeners.add(onStoreChange);
	return () => {
		listeners.delete(onStoreChange);
	};
}

export function useHeroBackdrop(): HeroBackdropPayload | null {
	return useSyncExternalStore(
		subscribe,
		() => payload,
		() => null,
	);
}
