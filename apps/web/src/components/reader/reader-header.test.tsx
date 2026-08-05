import "@/test-utils/setup-dom";
import { expect, mock, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { ReaderHeader } from "./reader-header";

test("a closed reader header exposes the standard top-edge opener", () => {
	const onOpen = mock(() => {});
	const view = render(
		<ReaderHeader
			open={false}
			theme={{
				id: "test",
				fontColor: "white",
				backgroundColor: "black",
				selectionFontColor: "white",
				selectionBackgroundColor: "black",
				hintFuriganaShadowColor: "black",
				hintFuriganaFontColor: "white",
				tooltipTextFontColor: "white",
			}}
			bookTitle="Test book"
			hasChapterData={false}
			isBookmarkScreen={false}
			hasBookmarkData={false}
			hasImages={false}
			onOpen={onOpen}
			onTocClick={() => {}}
			onBookmarkClick={() => {}}
			onScrollToBookmarkClick={() => {}}
			onCompleteBook={() => {}}
			onFullscreenClick={() => {}}
			onImageGalleryClick={() => {}}
			onQuickSettingsClick={() => {}}
			onExitClick={() => {}}
		/>,
	);

	fireEvent.click(view.getByRole("button", { name: "Show reader menu" }));
	expect(onOpen).toHaveBeenCalledTimes(1);
});
