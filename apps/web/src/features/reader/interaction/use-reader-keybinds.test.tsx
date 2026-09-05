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

test("B and R share bookmark actions across reader modes and ignore typing and modified keys", () => {
	const save = mock(() => {});
	const go = mock(() => {});
	for (const renderer of [
		"text-scroll",
		"text-paginated",
		"text-focus",
		"visual",
		"pdf",
	] as const) {
		const api = createApi();
		const hook = renderHook(() =>
			useReaderKeybinds({
				apiRef: { current: api },
				presentation: { ...paginatedPresentation, renderer },
				verticalMode: false,
				galleryOpen: false,
				tocOpen: false,
				settingsOpen: false,
				onCloseToc: () => {},
				onCloseSettings: () => {},
				onChangeChapter: () => {},
				onSaveReadingPoint: save,
				onGoToReadingPoint: go,
			}),
		);
		fireEvent.keyDown(window, { key: "b", code: "KeyB" });
		fireEvent.keyDown(window, { key: "r", code: "KeyR" });
		fireEvent.keyDown(window, { key: "b", code: "KeyB", repeat: true });
		fireEvent.keyDown(window, { key: "r", code: "KeyR", ctrlKey: true });
		fireEvent.keyDown(window, { key: "b", code: "KeyB", isComposing: true });
		const input = document.createElement("input");
		document.body.append(input);
		fireEvent.keyDown(input, { key: "b", code: "KeyB" });
		const editor = document.createElement("div");
		editor.setAttribute("contenteditable", "");
		document.body.append(editor);
		fireEvent.keyDown(editor, { key: "r", code: "KeyR" });
		hook.unmount();
		input.remove();
		editor.remove();
	}
	expect(save).toHaveBeenCalledTimes(5);
	expect(go).toHaveBeenCalledTimes(5);
});
