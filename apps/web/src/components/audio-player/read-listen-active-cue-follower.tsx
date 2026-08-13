import { useRef } from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

type ScrollToIndex = (
	index: number,
	options: { align: "center"; behavior: "auto" },
) => void;

export function ReadListenActiveCueFollower({
	active,
	layoutRevision,
	scrollToIndex,
}: {
	active: { id: string; index: number } | null;
	layoutRevision: number;
	scrollToIndex: ScrollToIndex;
}) {
	const activeId = active?.id;
	const activeIndex = active?.index;
	const scrollToIndexRef = useRef(scrollToIndex);
	scrollToIndexRef.current = scrollToIndex;
	useIsomorphicLayoutEffect(() => {
		if (activeIndex === undefined) return;
		scrollToIndexRef.current(activeIndex, {
			align: "center",
			behavior: "auto",
		});
	}, [activeId, activeIndex, layoutRevision]);

	return null;
}
