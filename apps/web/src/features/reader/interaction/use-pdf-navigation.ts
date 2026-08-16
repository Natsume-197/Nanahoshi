import { useScroll, useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	clampPdfPage,
	pdfNavigationBehavior,
} from "@/features/reader/renderers/pdf/pdf-view-state";

export function usePdfNavigation(
	documentId: string,
	pageCount: number,
	restorePage?: number,
) {
	const { state, provides: scroll } = useScroll(documentId);
	const { provides: scrollCapability } = useScrollCapability();
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

	useEffect(() => {
		if (
			restorePage === undefined ||
			!scroll ||
			!scrollCapability ||
			restoredRef.current
		)
			return;
		const restore = () => {
			if (restoredRef.current || scroll.getTotalPages() <= 0) return;
			restoredRef.current = true;
			goToPage(restorePage, "instant");
			requestAnimationFrame(() => setPositionReady(true));
		};
		const unsubscribe = scrollCapability.onLayoutReady((event) => {
			if (event.documentId === documentId) restore();
		});
		const frame = requestAnimationFrame(() => {
			try {
				if (scroll.getLayout().virtualItems.length > 0) restore();
			} catch {
				// The layout-ready event will perform the restore.
			}
		});
		return () => {
			cancelAnimationFrame(frame);
			unsubscribe();
		};
	}, [documentId, goToPage, restorePage, scroll, scrollCapability]);

	return { currentPage, goToPage, positionReady };
}
