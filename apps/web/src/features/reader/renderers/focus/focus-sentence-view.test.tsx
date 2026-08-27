import "@/test-utils/setup-dom";

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { FocusSentenceView } from "./focus-sentence-view";
import type { TypewriterHandle } from "./focus-typewriter";

class TestResizeObserver {
	observe() {}
	disconnect() {}
}

const originalResizeObserver = Object.getOwnPropertyDescriptor(
	globalThis,
	"ResizeObserver",
);
Object.defineProperty(globalThis, "ResizeObserver", {
	configurable: true,
	writable: true,
	value: TestResizeObserver,
});

afterEach(() => {
	cleanup();
	if (originalResizeObserver) {
		Object.defineProperty(globalThis, "ResizeObserver", originalResizeObserver);
	} else {
		Reflect.deleteProperty(globalThis, "ResizeObserver");
	}
});

describe("FocusSentenceView", () => {
	test("removes the sentence indicator when the live setting is disabled", async () => {
		const typewriterRef = createRef<TypewriterHandle | null>();
		const sentence = {
			kind: "text" as const,
			text: "終わり。",
			startCharacter: 0,
			endCharacter: 4,
			sectionReference: "section-1",
			fragmentIds: [],
			html: "<p>終わり。</p>",
		};
		const view = render(
			<FocusSentenceView
				sentence={sentence}
				html={sentence.html}
				typeAt={null}
				showIndicator={true}
				hideFurigana={false}
				furiganaStyle="Partial"
				typewriterRef={typewriterRef}
				onTypingChange={() => {}}
			/>,
		);

		await waitFor(() => {
			expect(
				view.container.querySelector(".focus-sentence-indicator"),
			).not.toBeNull();
		});

		view.rerender(
			<FocusSentenceView
				sentence={sentence}
				html={sentence.html}
				typeAt={null}
				showIndicator={false}
				hideFurigana={false}
				furiganaStyle="Partial"
				typewriterRef={typewriterRef}
				onTypingChange={() => {}}
			/>,
		);

		await waitFor(() => {
			expect(
				view.container.querySelector(".focus-sentence-indicator"),
			).toBeNull();
		});

		view.rerender(
			<FocusSentenceView
				sentence={sentence}
				html={sentence.html}
				typeAt={null}
				showIndicator={true}
				hideFurigana={false}
				furiganaStyle="Partial"
				typewriterRef={typewriterRef}
				onTypingChange={() => {}}
			/>,
		);

		await waitFor(() => {
			expect(
				view.container.querySelector(".focus-sentence-indicator"),
			).not.toBeNull();
		});
	});
});
