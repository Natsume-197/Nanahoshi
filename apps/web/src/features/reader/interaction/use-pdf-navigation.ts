import { useScroll, useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	clampPdfPage,
	pdfNavigationBehavior,
} from "@/features/reader/renderers/pdf/pdf-view-state";

export function usePdfNavigation(
	documentId: string,
	pageCount: number,
	restorePage?: number,
) {
	const { state } = useScroll(documentId);
	const { provides: scrollCapability } = useScrollCapability();
	// useScroll's `provides` is a new scope every render; an unstable scope
	// re-attached the viewport ref on each commit and looped parent updates.
	const scroll = useMemo(
		() => scrollCapability?.forDocument(documentId) ?? null,
		[scrollCapability, documentId],
	);
	const currentPage = clampPdfPage(state.currentPage, pageCount);
	const currentPageRef = useRef(currentPage);
	const restoredRef = useRef(false);
	const [positionReady, setPositionReady] = useState(restorePage === undefined);
	currentPageRef.current = currentPage;

	const goToPage = useCallback(
		(pageNumber: number, behavior?: ScrollBehavior) => {
			const targetPage = clampPdfPage(pageNumber, pageCount);
			scroll?.scrollToPage({
				pageNumber: targetPage,
				behavior:
					behavior ?? pdfNavigationBehavior(currentPageRef.current, targetPage),
				alignX: 50,
				alignY: 50,
			});
		},
		[pageCount, scroll],
	);

	const restorePosition = useCallback(
		(viewport: HTMLElement | null) => {
			if (!viewport) return;
			if (
				restorePage === undefined ||
				!scroll ||
				!scrollCapability ||
				restoredRef.current
			)
				return;
			const targetPage = clampPdfPage(restorePage, pageCount);
			let stopWaiting: (() => void) | undefined;
			const ready = () => {
				stopWaiting?.();
				setPositionReady(true);
			};
			// Only restore on layout-ready (replayed to late subscribers): the engine
			// resets the scroll offset when layout becomes ready, undoing any earlier jump.
			const unsubscribe = scrollCapability.onLayoutReady((event) => {
				if (event.documentId !== documentId || restoredRef.current) return;
				if (scroll.getTotalPages() <= 0) return;
				restoredRef.current = true;
				// Page progress stays gated until the viewport reports the target,
				// otherwise the pre-jump page 1 is saved over the resume point.
				const unsubscribePage = scrollCapability.onPageChange((change) => {
					if (
						change.documentId === documentId &&
						change.pageNumber === targetPage
					)
						ready();
				});
				const fallback = window.setTimeout(ready, 1000);
				stopWaiting = () => {
					unsubscribePage();
					window.clearTimeout(fallback);
				};
				goToPage(targetPage, "instant");
			});
			return () => {
				stopWaiting?.();
				unsubscribe();
			};
		},
		[documentId, goToPage, pageCount, restorePage, scroll, scrollCapability],
	);

	// Until the restore lands the viewport still shows page 1; report the target
	// so a sync in that window cannot save page 1 over the resume point.
	const readingPage =
		positionReady || restorePage === undefined
			? currentPage
			: clampPdfPage(restorePage, pageCount);

	return { currentPage, readingPage, goToPage, positionReady, restorePosition };
}
