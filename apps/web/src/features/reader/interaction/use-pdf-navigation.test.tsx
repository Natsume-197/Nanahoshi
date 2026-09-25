import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";

// EmbedPDF's useScroll returns `provides.forDocument(id)`, a fresh scope on
// every render; the hook must not let that identity leak into its callbacks.
type Listener<T> = (event: T) => void;
const layoutReadyListeners = new Set<Listener<{ documentId: string }>>();
const pageChangeListeners = new Set<
	Listener<{ documentId: string; pageNumber: number }>
>();
const subscribe =
	<T,>(listeners: Set<Listener<T>>) =>
	(listener: Listener<T>) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};
const scrollToPage = mock(() => {});
const capability = {
	forDocument: () => ({
		scrollToPage,
		getTotalPages: () => 10,
		getLayout: () => ({ virtualItems: [{}] }),
	}),
	onLayoutReady: subscribe(layoutReadyListeners),
	onPageChange: subscribe(pageChangeListeners),
};
mock.module("@embedpdf/plugin-scroll/react", () => ({
	useScrollCapability: () => ({ provides: capability }),
	useScroll: (documentId: string) => ({
		provides: capability.forDocument(documentId),
		state: { currentPage: 1, totalPages: 10 },
	}),
}));

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { usePdfNavigation } = await import("./use-pdf-navigation");

afterEach(() => {
	cleanup();
	scrollToPage.mockClear();
	layoutReadyListeners.clear();
	pageChangeListeners.clear();
});

describe("usePdfNavigation", () => {
	// A new restorePosition re-attached the viewport ref on every commit, whose
	// parent callbacks set state: "Maximum update depth exceeded" on open.
	test("keeps its callbacks stable across rerenders", () => {
		const { result, rerender } = renderHook(() =>
			usePdfNavigation("doc-1", 10, 4),
		);
		const first = result.current;
		rerender();
		expect(result.current.restorePosition).toBe(first.restorePosition);
		expect(result.current.goToPage).toBe(first.goToPage);
	});

	// A progress sync before the restore landed saved page 1 over the resume
	// point, and the reader reopened on the cover.
	test("reports the resume page until the restore lands", () => {
		const pending = renderHook(() => usePdfNavigation("doc-1", 10, 7));
		expect(pending.result.current.currentPage).toBe(1);
		expect(pending.result.current.readingPage).toBe(7);

		const fresh = renderHook(() => usePdfNavigation("doc-2", 10));
		expect(fresh.result.current.readingPage).toBe(1);
	});

	// Jumping before layout-ready was undone by the engine resetting the scroll
	// offset, so the book reopened on page 1.
	test("restores on layout-ready and waits for the target page", () => {
		const { result } = renderHook(() => usePdfNavigation("doc-1", 10, 7));
		const detach = result.current.restorePosition(
			document.createElement("div"),
		);
		expect(scrollToPage).not.toHaveBeenCalled();

		act(() => {
			for (const listener of layoutReadyListeners)
				listener({ documentId: "doc-1" });
		});
		expect(scrollToPage).toHaveBeenCalledWith(
			expect.objectContaining({ pageNumber: 7, behavior: "instant" }),
		);
		expect(result.current.positionReady).toBe(false);

		act(() => {
			for (const listener of pageChangeListeners)
				listener({ documentId: "doc-1", pageNumber: 7 });
		});
		expect(result.current.positionReady).toBe(true);
		detach?.();
	});

	test("navigates through the document scope", () => {
		const { result } = renderHook(() => usePdfNavigation("doc-1", 10));
		result.current.goToPage(20, "instant");
		expect(scrollToPage).toHaveBeenCalledWith(
			expect.objectContaining({ pageNumber: 10, behavior: "instant" }),
		);
	});
});
