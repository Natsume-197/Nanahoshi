import "@/test-utils/setup-dom";
import { expect, mock, test } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { createElement, useState } from "react";
import { BookReaderManga } from "./book-reader-manga";

test("mounts only the visible manga spread and advances RTL from the leading edge", () => {
	const pageCount = 180;
	const htmlContent = Array.from(
		{ length: pageCount },
		(_, index) =>
			`<div id="page-${index}"><div class="ttu-book-html-wrapper ttu-no-text"><div class="ttu-book-body-wrapper ttu-no-text"><div class="ttu-comic-page"><img src="page-${index}.jpg" data-ttu-natural-width="2250" data-ttu-natural-height="3206"></div></div></div></div>`,
	).join("");
	const sections = Array.from({ length: pageCount }, (_, index) => ({
		reference: `page-${index}`,
		charactersWeight: 1,
		startCharacter: index,
		characters: 1,
	}));
	const onToggleChrome = mock(() => {});

	const view = render(
		createElement(BookReaderManga, {
			htmlContent,
			theme: {
				id: "test",
				fontColor: "white",
				backgroundColor: "black",
				selectionFontColor: "white",
				selectionBackgroundColor: "black",
				hintFuriganaShadowColor: "black",
				hintFuriganaFontColor: "white",
				tooltipTextFontColor: "white",
			},
			layout: "two-page-spread",
			language: "ja",
			pageProgressionDirection: null,
			readingDirection: "auto",
			sections,
			initialPosition: undefined,
			initialBookmark: undefined,
			onExploredCharCountChange: () => {},
			onSectionProgressChange: () => {},
			onToggleChrome,
			apiRef: () => {},
		}),
	);

	// Explicit two-page-spread mode is a real spread from the opening viewport.
	expect(view.container.querySelectorAll(".manga-page-slot")).toHaveLength(2);
	expect(view.container.querySelector("#page-0")).not.toBeNull();
	expect(view.container.querySelector("#page-1")).not.toBeNull();

	// Page turns are coordinate-based: no transparent full-screen buttons may
	// sit above the reader and intercept its chrome or other actions.
	const reader = view.container.querySelector(
		".book-content--manga",
	) as HTMLElement;
	expect(reader.querySelectorAll("button")).toHaveLength(0);
	Object.defineProperty(reader, "getBoundingClientRect", {
		value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
	});

	// In RTL, tapping the physical left/leading third advances to pages 2–3.
	fireEvent.click(reader, { clientX: 10, clientY: 50 });
	expect(view.container.querySelectorAll(".manga-page-slot")).toHaveLength(2);
	expect(view.container.querySelector("#page-2")).not.toBeNull();
	expect(view.container.querySelector("#page-3")).not.toBeNull();
	expect(view.container.querySelector("#page-4")).toBeNull();
	for (let index = 0; index < 20; index += 1) {
		fireEvent.click(reader, { clientX: 10, clientY: 50 });
	}
	expect(view.container.querySelector("#page-42")).not.toBeNull();
	expect(view.container.querySelector("#page-43")).not.toBeNull();
	expect(view.container.querySelectorAll(".manga-page-slot")).toHaveLength(2);

	fireEvent.click(reader, { clientX: 50, clientY: 50 });
	expect(onToggleChrome).toHaveBeenCalledTimes(1);
});

test("eagerly decodes the next spread before it becomes visible", async () => {
	const decoded: string[] = [];
	const OriginalImage = window.Image;
	class DecodeProbe {
		private value = "";
		set src(value: string) {
			this.value = value;
		}
		get src() {
			return this.value;
		}
		decode() {
			decoded.push(this.value);
			return Promise.resolve();
		}
	}
	Object.defineProperty(window, "Image", {
		configurable: true,
		value: DecodeProbe,
	});

	try {
		const htmlContent = Array.from(
			{ length: 6 },
			(_, index) =>
				`<div id="page-${index}"><div class="ttu-book-html-wrapper ttu-no-text"><div class="ttu-book-body-wrapper ttu-no-text"><div class="ttu-comic-page"><img loading="lazy" src="page-${index}.jpg" data-ttu-natural-width="2250" data-ttu-natural-height="3206"></div></div></div></div>`,
		).join("");
		const sections = Array.from({ length: 6 }, (_, index) => ({
			reference: `page-${index}`,
			charactersWeight: 1,
			startCharacter: index,
			characters: 1,
		}));

		const view = render(
			createElement(BookReaderManga, {
				htmlContent,
				theme: {
					id: "test",
					fontColor: "white",
					backgroundColor: "black",
					selectionFontColor: "white",
					selectionBackgroundColor: "black",
					hintFuriganaShadowColor: "black",
					hintFuriganaFontColor: "white",
					tooltipTextFontColor: "white",
				},
				layout: "two-page-spread",
				language: "ja",
				readingDirection: "auto",
				sections,
				initialPosition: undefined,
				initialBookmark: undefined,
				onExploredCharCountChange: () => {},
				onSectionProgressChange: () => {},
				onToggleChrome: () => {},
				apiRef: () => {},
			}),
		);

		await waitFor(() => {
			expect(decoded).toEqual(["page-2.jpg", "page-3.jpg"]);
		});
		expect(
			view.container.querySelector("#page-0 img")?.getAttribute("loading"),
		).toBe("eager");
	} finally {
		Object.defineProperty(window, "Image", {
			configurable: true,
			value: OriginalImage,
		});
	}
});

test("stacks every image page, loads lazily and tracks the visible page", async () => {
	const htmlContent = Array.from(
		{ length: 6 },
		(_, index) =>
			`<div id="page-${index}"><div class="ttu-book-html-wrapper ttu-no-text"><div class="ttu-book-body-wrapper ttu-no-text"><div class="ttu-comic-page"><img src="page-${index}.jpg" data-ttu-natural-width="2250" data-ttu-natural-height="3206"></div></div></div></div>`,
	).join("");
	const sections = Array.from({ length: 6 }, (_, index) => ({
		reference: `page-${index}`,
		charactersWeight: 1,
		startCharacter: index,
		characters: 1,
	}));
	const onExploredCharCountChange = mock(() => {});

	const view = render(
		createElement(BookReaderManga, {
			htmlContent,
			theme: {
				id: "test",
				fontColor: "white",
				backgroundColor: "black",
				selectionFontColor: "white",
				selectionBackgroundColor: "black",
				hintFuriganaShadowColor: "black",
				hintFuriganaFontColor: "white",
				tooltipTextFontColor: "white",
			},
			layout: "vertical-strip",
			language: "ja",
			readingDirection: "auto",
			sections,
			initialPosition: undefined,
			initialBookmark: undefined,
			onExploredCharCountChange,
			onSectionProgressChange: () => {},
			onToggleChrome: () => {},
			apiRef: () => {},
		}),
	);

	expect(view.container.querySelectorAll(".manga-page-slot")).toHaveLength(6);
	expect(
		Array.from(view.container.querySelectorAll("img")).every(
			(image) => image.getAttribute("loading") === "lazy",
		),
	).toBe(true);
	expect(
		view.container
			.querySelector(".book-content--manga")
			?.classList.contains("book-content--manga-continuous"),
	).toBe(true);
	expect(
		(view.container.querySelector(".manga-page-slot") as HTMLElement).style
			.aspectRatio,
	).toBe("2250 / 3206");

	const reader = view.container.querySelector(
		".book-content--manga",
	) as HTMLElement;
	Object.defineProperty(reader, "clientHeight", { value: 1000 });
	reader.scrollTop = 1500;
	view.container
		.querySelectorAll<HTMLElement>(".manga-page-slot")
		.forEach((slot, index) => {
			Object.defineProperty(slot, "offsetTop", { value: index * 1000 });
		});
	fireEvent.scroll(reader);
	await waitFor(() => {
		expect(onExploredCharCountChange).toHaveBeenLastCalledWith(1);
	});
});

test("renders a lazy horizontal wide strip and tracks the page at the reading edge", async () => {
	const htmlContent = Array.from(
		{ length: 4 },
		(_, index) =>
			`<div id="page-${index}"><div class="ttu-book-html-wrapper ttu-no-text"><div class="ttu-book-body-wrapper ttu-no-text"><div class="ttu-comic-page"><img src="page-${index}.jpg" data-ttu-natural-width="2250" data-ttu-natural-height="3206"></div></div></div></div>`,
	).join("");
	const sections = Array.from({ length: 4 }, (_, index) => ({
		reference: `page-${index}`,
		charactersWeight: 1,
		startCharacter: index,
		characters: 1,
	}));
	const onExploredCharCountChange = mock(() => {});
	const view = render(
		createElement(BookReaderManga, {
			htmlContent,
			theme: {
				id: "test",
				fontColor: "white",
				backgroundColor: "black",
				selectionFontColor: "white",
				selectionBackgroundColor: "black",
				hintFuriganaShadowColor: "black",
				hintFuriganaFontColor: "white",
				tooltipTextFontColor: "white",
			},
			layout: "horizontal-strip",
			language: "en",
			readingDirection: "ltr",
			sections,
			initialPosition: undefined,
			initialBookmark: undefined,
			onExploredCharCountChange,
			onSectionProgressChange: () => {},
			onToggleChrome: () => {},
			apiRef: () => {},
		}),
	);

	const reader = view.container.querySelector(
		".book-content--manga-horizontal-strip",
	) as HTMLElement;
	expect(reader).not.toBeNull();
	expect(view.container.querySelectorAll(".manga-page-slot")).toHaveLength(4);
	expect(
		Array.from(view.container.querySelectorAll("img")).every(
			(image) => image.getAttribute("loading") === "lazy",
		),
	).toBe(true);
	Object.defineProperty(reader, "clientWidth", { value: 1000 });
	Object.defineProperty(reader, "getBoundingClientRect", {
		value: () => ({ left: 0, right: 1000, top: 0, bottom: 800 }),
	});
	view.container
		.querySelectorAll<HTMLElement>(".manga-page-slot")
		.forEach((slot, index) => {
			Object.defineProperty(slot, "getBoundingClientRect", {
				value: () => ({
					left: index * 500 - 500,
					right: index * 500,
					top: 0,
					bottom: 800,
				}),
			});
		});
	fireEvent.scroll(reader);
	await waitFor(() => {
		expect(onExploredCharCountChange).toHaveBeenLastCalledWith(1);
	});
});

test("fits a fixed-layout SVG page using its viewBox in paginated and horizontal-strip modes", () => {
	const htmlContent = `<div id="page-0"><div class="ttu-book-html-wrapper ttu-no-text"><div class="ttu-book-body-wrapper ttu-no-text"><div class="main"><svg width="100%" height="100%" viewBox="0 0 1441 2048"><image width="100%" height="100%" href="page-0.jpg" /></svg></div></div></div></div>`;
	const sections = [
		{
			reference: "page-0",
			charactersWeight: 1,
			startCharacter: 0,
			characters: 1,
		},
	];
	const props = {
		htmlContent,
		theme: {
			id: "test",
			fontColor: "white",
			backgroundColor: "black",
			selectionFontColor: "white",
			selectionBackgroundColor: "black",
			hintFuriganaShadowColor: "black",
			hintFuriganaFontColor: "white",
			tooltipTextFontColor: "white",
		},
		language: "ja",
		readingDirection: "rtl" as const,
		sections,
		initialPosition: undefined,
		initialBookmark: undefined,
		onExploredCharCountChange: () => {},
		onSectionProgressChange: () => {},
		onToggleChrome: () => {},
		apiRef: () => {},
	};
	const view = render(
		createElement(BookReaderManga, {
			...props,
			layout: "single-page",
		}),
	);
	let slot = view.container.querySelector(".manga-page-slot") as HTMLElement;
	expect(slot.style.aspectRatio).toBe("1441 / 2048");
	expect(Number.parseFloat(slot.style.width)).toBeGreaterThan(0);
	expect(Number.parseFloat(slot.style.height)).toBeGreaterThan(0);
	expect(
		Number.parseFloat(slot.style.width) / Number.parseFloat(slot.style.height),
	).toBeCloseTo(1441 / 2048);

	view.rerender(
		createElement(BookReaderManga, {
			...props,
			layout: "horizontal-strip",
		}),
	);
	slot = view.container.querySelector(".manga-page-slot") as HTMLElement;
	expect(
		view.container.querySelector(".book-content--manga-horizontal-strip"),
	).not.toBeNull();
	expect(slot.style.aspectRatio).toBe("1441 / 2048");
	expect(slot.style.flex).toBe("0 0 auto");
});

test("does not feed progress updates back into an infinite parent render loop", async () => {
	let renders = 0;
	const htmlContent = `<div id="page-0"><div class="ttu-book-html-wrapper ttu-no-text"><div class="ttu-book-body-wrapper ttu-no-text"><div class="main"><svg viewBox="0 0 1439 2048"><image href="page.jpg" /></svg></div></div></div></div>`;
	const sections = [
		{
			reference: "page-0",
			charactersWeight: 1,
			startCharacter: 0,
			characters: 1,
		},
	];

	function ProgressHost() {
		renders += 1;
		if (renders > 20) throw new Error("visual reader progress render loop");
		const [, setProgress] = useState(new Map());
		return createElement(BookReaderManga, {
			htmlContent,
			theme: {
				id: "test",
				fontColor: "white",
				backgroundColor: "black",
				selectionFontColor: "white",
				selectionBackgroundColor: "black",
				hintFuriganaShadowColor: "black",
				hintFuriganaFontColor: "white",
				tooltipTextFontColor: "white",
			},
			layout: "single-page",
			language: "ja",
			readingDirection: "auto",
			sections,
			initialPosition: undefined,
			initialBookmark: undefined,
			onExploredCharCountChange: () => {},
			onSectionProgressChange: setProgress,
			onToggleChrome: () => {},
			apiRef: () => {},
		});
	}

	const view = render(createElement(ProgressHost));
	await waitFor(() =>
		expect(view.container.querySelector("svg")).not.toBeNull(),
	);
	expect(renders).toBeLessThan(5);
});
