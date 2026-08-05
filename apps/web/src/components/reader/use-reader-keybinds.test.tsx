import "@/test-utils/setup-dom";
import { expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import type { RefObject } from "react";
import type { ComicLayout } from "@/lib/reader/manga-settings";
import type {
	ReaderEngineKind,
	ReaderPresentation,
} from "@/lib/reader/reader-presentation";
import type { BookReaderApi } from "./reader-shared-props";
import { useReaderKeybinds } from "./use-reader-keybinds";

function Harness({
	controller,
	engine,
	verticalMode = false,
	comicDirection,
	comicLayout = "single-page",
}: {
	controller: BookReaderApi;
	engine: ReaderEngineKind;
	verticalMode?: boolean;
	comicDirection?: "ltr" | "rtl";
	comicLayout?: ComicLayout;
}) {
	const presentation: ReaderPresentation = {
		readAs: engine === "comic" ? "comic" : "text",
		resolvedAs: engine === "comic" ? "comic" : "text",
		textLayout: engine === "text-paginated" ? "paginated" : "scroll",
		comicLayout,
		engine,
		supportsComic: true,
	};
	useReaderKeybinds({
		apiRef: { current: controller } as RefObject<BookReaderApi | null>,
		bookmarkRef: { current: undefined },
		presentation,
		verticalMode,
		comicDirection,
		autoScrollMultiplier: 20,
		galleryOpen: false,
		tocOpen: false,
		settingsOpen: false,
		onBookmark: () => {},
		onCloseToc: () => {},
		onCloseSettings: () => {},
		onChangeChapter: () => {},
		onAutoScrollMultiplierChange: () => {},
	});
	return null;
}

function controller(patch: Partial<BookReaderApi> = {}): BookReaderApi {
	return {
		nextPage: mock(() => {}),
		prevPage: mock(() => {}),
		navigateToSection: () => {},
		getBookmark: () => undefined,
		scrollToBookmark: () => {},
		showBookmarkMarker: () => {},
		relayout: () => {},
		...patch,
	};
}

test("comic direction takes precedence over dormant text writing settings", () => {
	const api = controller();
	const view = render(
		<Harness
			controller={api}
			engine="comic"
			verticalMode
			comicDirection="ltr"
		/>,
	);
	const event = new window.KeyboardEvent("keydown", {
		code: "ArrowLeft",
		bubbles: true,
		cancelable: true,
	});
	window.dispatchEvent(event);
	expect(api.prevPage).toHaveBeenCalledTimes(1);
	expect(api.nextPage).not.toHaveBeenCalled();
	expect(event.defaultPrevented).toBe(true);
	view.unmount();
});

test("unsupported auto-scroll remains a normal Space key", () => {
	const api = controller();
	const view = render(<Harness controller={api} engine="text-paginated" />);
	const event = new window.KeyboardEvent("keydown", {
		code: "Space",
		bubbles: true,
		cancelable: true,
	});
	window.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(false);
	view.unmount();
});

test("continuous mode invokes its optional auto-scroll capability", () => {
	const toggleAutoScroll = mock(() => {});
	const api = controller({
		toggleAutoScroll,
		setAutoScrollMultiplier: () => {},
	});
	const view = render(<Harness controller={api} engine="text-scroll" />);
	const event = new window.KeyboardEvent("keydown", {
		code: "Space",
		bubbles: true,
		cancelable: true,
	});
	window.dispatchEvent(event);
	expect(toggleAutoScroll).toHaveBeenCalledTimes(1);
	expect(event.defaultPrevented).toBe(true);
	view.unmount();
});

test("comic strip leaves arrow scrolling native but pages with PageDown", () => {
	const api = controller();
	const view = render(
		<Harness
			controller={api}
			engine="comic"
			comicDirection="rtl"
			comicLayout="vertical-strip"
		/>,
	);
	const arrow = new window.KeyboardEvent("keydown", {
		code: "ArrowDown",
		bubbles: true,
		cancelable: true,
	});
	window.dispatchEvent(arrow);
	expect(arrow.defaultPrevented).toBe(false);

	const pageDown = new window.KeyboardEvent("keydown", {
		code: "PageDown",
		bubbles: true,
		cancelable: true,
	});
	window.dispatchEvent(pageDown);
	expect(api.nextPage).toHaveBeenCalledTimes(1);
	expect(pageDown.defaultPrevented).toBe(true);
	view.unmount();
});
