import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { useRef } from "react";
import type { ReaderPresentation } from "@/features/reader/presentation/reader-presentation";
import type { BookReaderApi } from "@/features/reader/reader-contract";

const { cleanup, fireEvent, renderHook } = await import(
	"@testing-library/react"
);
const { useReaderKeybinds } = await import("./use-reader-keybinds");

const paginatedPresentation: ReaderPresentation = {
	readAs: "text",
	resolvedAs: "text",
	textLayout: "paginated",
	visualLayout: "single-page",
	contentKind: "text",
	renderer: "text-paginated",
	supportsVisual: false,
};

function useKeybindHarness(api: BookReaderApi) {
	const apiRef = useRef<BookReaderApi | null>(api);
	useReaderKeybinds({
		apiRef,
		presentation: paginatedPresentation,
		verticalMode: true,
		galleryOpen: false,
		tocOpen: false,
		settingsOpen: true,
		onCloseToc: () => {},
		onCloseSettings: () => {},
		onChangeChapter: () => {},
	});
}

function createApi() {
	return {
		nextPage: mock(() => {}),
		prevPage: mock(() => {}),
		navigateToSection: () => {},
		getPosition: () => undefined,
		scrollToPosition: () => {},
		relayout: () => {},
	} satisfies BookReaderApi;
}

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

describe("useReaderKeybinds", () => {
	test("keeps paginated navigation available from a focused settings button", () => {
		const api = createApi();
		renderHook(() => useKeybindHarness(api));
		const toggle = document.createElement("button");
		document.body.append(toggle);

		fireEvent.keyDown(toggle, { key: "ArrowLeft", code: "ArrowLeft" });

		expect(api.nextPage).toHaveBeenCalledTimes(1);
		expect(api.prevPage).not.toHaveBeenCalled();
	});

	test("does not steal arrow keys from settings inputs", () => {
		const api = createApi();
		renderHook(() => useKeybindHarness(api));
		const slider = document.createElement("input");
		slider.type = "range";
		document.body.append(slider);

		fireEvent.keyDown(slider, {
			key: "ArrowLeft",
			code: "ArrowLeft",
		});

		expect(api.nextPage).not.toHaveBeenCalled();
		expect(api.prevPage).not.toHaveBeenCalled();
	});
});
