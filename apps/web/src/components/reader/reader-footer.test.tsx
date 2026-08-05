import "@/test-utils/setup-dom";
import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { ReaderFooter } from "./reader-footer";

const theme = {
	id: "test",
	fontColor: "white",
	backgroundColor: "black",
	selectionFontColor: "white",
	selectionBackgroundColor: "black",
	hintFuriganaShadowColor: "black",
	hintFuriganaFontColor: "white",
	tooltipTextFontColor: "white",
};

test("renders one accessible light segment per manga page", () => {
	const view = render(
		<ReaderFooter
			theme={theme}
			exploredCharCount={0}
			bookCharCount={5}
			showCharacterCounter
			showPercentage
			passThrough
			comicProgress={{ currentPage: 2, pageCount: 5, style: "page-lines" }}
		/>,
	);
	const progress = view.container.querySelector(
		'[role="progressbar"][aria-label="Reading progress"]',
	) as HTMLElement;
	expect(progress.getAttribute("aria-valuetext")).toBe("Page 2 of 5");
	expect(progress.querySelectorAll("span")).toHaveLength(5);
});

test("renders the single manga progress bar at page-based completion", () => {
	const view = render(
		<ReaderFooter
			theme={theme}
			exploredCharCount={0}
			bookCharCount={4}
			showCharacterCounter
			showPercentage
			passThrough
			comicProgress={{ currentPage: 3, pageCount: 4, style: "bar" }}
		/>,
	);
	const progress = view.container.querySelector(
		'[role="progressbar"][aria-label="Reading progress"]',
	) as HTMLElement;
	expect(progress.getAttribute("aria-valuenow")).toBe("75");
	expect((progress.firstElementChild as HTMLElement).style.width).toBe("75%");
});
