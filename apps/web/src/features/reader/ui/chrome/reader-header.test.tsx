import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ReaderHeader, ReaderMenuItem } from "./reader-header";

afterEach(cleanup);

const noop = () => {};

function renderHeader(onZoomIn = noop) {
	return render(
		<ReaderHeader
			open
			onOpen={noop}
			theme={{
				id: "test",
				fontColor: "black",
				backgroundColor: "white",
				selectionFontColor: "white",
				selectionBackgroundColor: "black",
				hintFuriganaShadowColor: "transparent",
				hintFuriganaFontColor: "black",
				tooltipTextFontColor: "black",
			}}
			bookTitle="The Odyssey"
			hasChapterData
			tocTitle="Pages"
			hasImages={false}
			searchAvailable
			onTocClick={noop}
			onCompleteBook={noop}
			onFullscreenClick={noop}
			onImageGalleryClick={noop}
			onSearchClick={noop}
			onQuickSettingsClick={noop}
			readListenAvailable={false}
			readListenActive={false}
			onReadListenClick={noop}
			onExitClick={noop}
			moreMenu={(close) => (
				<ReaderMenuItem
					icon={null}
					onClick={() => {
						close();
						onZoomIn();
					}}
				>
					Zoom in
				</ReaderMenuItem>
			)}
		/>,
	);
}

describe("ReaderHeader more menu", () => {
	test("shows the renderer's own rows next to the shared ones", () => {
		const onZoomIn = mock(noop);
		const view = renderHeader(onZoomIn);
		fireEvent.click(view.getByRole("button", { name: "More actions" }));

		fireEvent.click(view.getByRole("button", { name: "Zoom in" }));

		expect(onZoomIn).toHaveBeenCalledTimes(1);
		expect(view.queryByRole("button", { name: "Zoom in" })).toBeNull();
	});

	// The bar's slide transform once shrank the backdrop to the bar itself,
	// so a click on the page left the menu stuck open.
	test("a click anywhere outside the menu closes it", () => {
		const view = renderHeader();
		fireEvent.click(view.getByRole("button", { name: "More actions" }));
		const backdrop = view.getByRole("button", { name: "Close menu" });

		expect(backdrop.closest("[data-reader-header]")).toBeNull();
		fireEvent.click(backdrop);
		expect(view.queryByRole("button", { name: "Zoom in" })).toBeNull();
	});

	test("Escape closes the menu", () => {
		const view = renderHeader();
		fireEvent.click(view.getByRole("button", { name: "More actions" }));

		fireEvent.keyDown(window, { key: "Escape" });

		expect(view.queryByRole("button", { name: "Zoom in" })).toBeNull();
	});
});
