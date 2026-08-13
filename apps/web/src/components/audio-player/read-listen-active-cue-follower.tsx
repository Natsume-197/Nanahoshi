import { type RefObject, useRef } from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

type ScrollToIndex = (
	index: number,
	options: { align: "center"; behavior: "auto" },
) => void;

export function ReadListenActiveCueFollower({
	active,
	layoutRevision,
	scrollToIndex,
	viewportRef,
}: {
	active: { id: string; index: number } | null;
	layoutRevision: number;
	scrollToIndex: ScrollToIndex;
	viewportRef: RefObject<HTMLElement | null>;
}) {
	const activeId = active?.id;
	const activeIndex = active?.index;
	const scrollToIndexRef = useRef(scrollToIndex);
	const previousActiveRef = useRef<{
		id: string;
		index: number;
		layoutRevision: number;
	} | null>(null);
	scrollToIndexRef.current = scrollToIndex;
	useIsomorphicLayoutEffect(() => {
		if (activeId === undefined || activeIndex === undefined) {
			previousActiveRef.current = null;
			return;
		}

		const previous = previousActiveRef.current;
		const isRenderedContinuation =
			previous !== null && previous.layoutRevision === layoutRevision;
		const cueElement = isRenderedContinuation
			? Array.from(
					viewportRef.current?.querySelectorAll<HTMLElement>(
						"[data-read-listen-cue-id]",
					) ?? [],
				).find((element) => element.dataset.readListenCueId === activeId)
			: undefined;

		if (cueElement) {
			const reducedMotion = window.matchMedia?.(
				"(prefers-reduced-motion: reduce)",
			).matches;
			cueElement.scrollIntoView({
				block: "center",
				behavior: reducedMotion ? "auto" : "smooth",
				inline: "nearest",
			});
		} else {
			scrollToIndexRef.current(activeIndex, {
				align: "center",
				behavior: "auto",
			});
		}

		previousActiveRef.current = {
			id: activeId,
			index: activeIndex,
			layoutRevision,
		};
	}, [activeId, activeIndex, layoutRevision]);

	return null;
}
