import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

/**
 * Preloads the reader route. Navigation remains the source of truth: every
 * prefetch failure is silent.
 */
export function useReadListenReaderPrefetch(
	target:
		| {
				ebookUuid: string;
				pairUuid: string;
		  }
		| undefined,
) {
	const router = useRouter();

	const preloadRoute = useCallback(() => {
		if (!target) return Promise.resolve(undefined);
		return router.preloadRoute({
			to: "/reader/$uuid",
			params: { uuid: target.ebookUuid },
			search: { pair: target.pairUuid },
		});
	}, [router, target]);

	const prepare = useCallback(() => {
		void preloadRoute().catch(() => {});
	}, [preloadRoute]);

	return { prepare };
}
