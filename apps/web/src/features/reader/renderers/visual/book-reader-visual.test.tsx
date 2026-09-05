import "@/test-utils/setup-dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import {
	defaultReaderSettings,
	getReaderTheme,
} from "@/features/reader/presentation/settings";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import { BookReaderVisual } from "./book-reader-visual";

class TestIntersectionObserver {
	static current: TestIntersectionObserver;
	observed: Element[] = [];
	disconnected = false;
	constructor(private callback: IntersectionObserverCallback) {
		TestIntersectionObserver.current = this;
	}
	observe(element: Element) {
		this.observed.push(element);
	}
	disconnect() {
		this.disconnected = true;
	}
	show(index: number) {
		this.callback(
			this.observed.map(
				(target, i) =>
					({
						target,
						isIntersecting: i === index,
					}) as IntersectionObserverEntry,
			),
			this as unknown as IntersectionObserver,
		);
	}
}
const originalObserver = globalThis.IntersectionObserver;
afterEach(() => {
	cleanup();
	globalThis.IntersectionObserver = originalObserver;
});

for (const layout of ["horizontal-strip", "vertical-strip"] as const) {
	for (const readingDirection of ["ltr", "rtl"] as const) {
		test(`${layout} ${readingDirection}: windows img/SVG artwork, preserving slots and direct navigation`, async () => {
			globalThis.IntersectionObserver =
				TestIntersectionObserver as unknown as typeof IntersectionObserver;
			const htmlContent = Array.from(
				{ length: 1000 },
				(_, index) =>
					`<div id="page-${index}">${index % 2 ? '<svg viewBox="0 0 600 800"><image href="test.png" /></svg>' : '<img width="600" height="800" src="test.png">'}</div>`,
			).join("");
			let api: BookReaderApi | null = null;
			const view = render(
				<BookReaderVisual
					htmlContent={htmlContent}
					theme={getReaderTheme(defaultReaderSettings.theme)}
					layout={layout}
					language="en"
					readingDirection={readingDirection}
					sections={Array.from({ length: 1000 }, (_, index) => ({
						reference: `page-${index}`,
						charactersWeight: 1,
						startCharacter: index,
					}))}
					initialPosition={{
						exploredCharCount: 500,
						progress: 0.5,
						modifiedAt: 0,
					}}
					onPositionChange={() => {}}
					onSectionProgressChange={() => {}}
					onToggleChrome={() => {}}
					apiRef={(value) => {
						api = value;
					}}
				/>,
			);
			// Let initial restoration finish before testing an explicit jump.
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
			});
			const slots = view.container.querySelectorAll<HTMLElement>(
				"[data-visual-page-index]",
			);
			expect(slots.length).toBe(1000);
			expect(view.container.querySelectorAll("img, svg image").length).toBe(3);
			const target = slots[900];
			if (!target) throw new Error("Expected target page slot");
			const dimensions = [target.style.width, target.style.height];
			expect(dimensions.every(Boolean)).toBe(true);
			let scrolled = false;
			const register = spyOn(Map.prototype, "set");
			target.scrollIntoView = () => {
				scrolled = true;
			};
			act(() => {
				api?.navigateToSection("page-900");
			});
			const slotRegistrations = register.mock.calls.filter(
				([, value]) =>
					value instanceof HTMLElement &&
					value.hasAttribute("data-visual-page-index"),
			).length;
			register.mockRestore();
			expect(slotRegistrations).toBeLessThan(10);
			expect(scrolled).toBe(true);
			expect(target.querySelector("img")).not.toBeNull();
			expect(slots[500]?.querySelector("img")).toBeNull();
			expect([target.style.width, target.style.height]).toEqual(dimensions);
			const observer = TestIntersectionObserver.current;
			act(() => {
				observer.show(910);
			});
			expect(slots[910]?.querySelector("img")).not.toBeNull();
			expect(
				view.container.querySelectorAll("img, svg image").length,
			).toBeLessThanOrEqual(4);
			view.unmount();
			expect(observer.disconnected).toBe(true);
		});
	}
}
