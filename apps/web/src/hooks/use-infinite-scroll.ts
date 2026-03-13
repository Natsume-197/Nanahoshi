import { useCallback, useEffect, useRef } from "react";

interface useInfiniteScrollOptions {
	hasNextPage: boolean | undefined;
	isFetchingNextPage: boolean;
	fetchNextPage: () => void;
	enabled?: boolean;
}

/**
 * A reusable hook to handle infinite scrolling using IntersectionObserver.
 */
export function useInfiniteScroll({
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
	enabled = true,
}: useInfiniteScrollOptions) {
	const observerRef = useRef<IntersectionObserver | null>(null);

	const loadMoreRef = useCallback(
		(node: HTMLElement | null) => {
			if (observerRef.current) observerRef.current.disconnect();

			if (!enabled || isFetchingNextPage) return;

			observerRef.current = new IntersectionObserver((entries) => {
				if (entries[0].isIntersecting && hasNextPage) {
					fetchNextPage();
				}
			});

			if (node) observerRef.current.observe(node);
		},
		[enabled, isFetchingNextPage, hasNextPage, fetchNextPage],
	);

	useEffect(() => {
		return () => observerRef.current?.disconnect();
	}, []);

	return { loadMoreRef };
}
