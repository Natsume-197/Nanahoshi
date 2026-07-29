import { useCallback, useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

interface useInfiniteScrollOptions {
	hasNextPage: boolean | undefined;
	isFetchingNextPage: boolean;
	fetchNextPage: () => void;
	enabled?: boolean;
	/**
	 * Scroll container to observe against. Defaults to the viewport; pass the
	 * actual scroll element when the sentinel lives inside an inner scroller.
	 */
	root?: Element | null;
	/** Start loading before the sentinel reaches the visible viewport. */
	rootMargin?: string;
}

/**
 * A reusable hook to handle infinite scrolling using IntersectionObserver.
 */
export function useInfiniteScroll({
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
	enabled = true,
	root = null,
	rootMargin = "0px",
}: useInfiniteScrollOptions) {
	const observerRef = useRef<IntersectionObserver | null>(null);

	const loadMoreRef = useCallback(
		(node: HTMLElement | null) => {
			if (observerRef.current) observerRef.current.disconnect();

			if (!enabled || isFetchingNextPage) return;

			observerRef.current = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && hasNextPage) {
						fetchNextPage();
					}
				},
				{ root, rootMargin },
			);

			if (node) observerRef.current.observe(node);
		},
		[enabled, isFetchingNextPage, hasNextPage, fetchNextPage, root, rootMargin],
	);

	useMountEffect(() => {
		return () => observerRef.current?.disconnect();
	});

	return { loadMoreRef };
}
