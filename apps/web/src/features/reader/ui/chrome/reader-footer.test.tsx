import "@/test-utils/setup-dom";

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ReaderFooter } from "./reader-footer";

afterEach(cleanup);

describe("ReaderFooter pointer access", () => {
	test("lets the native tategaki scrollbar receive pointer input", () => {
		const view = render(
			<ReaderFooter
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
				exploredCharCount={40}
				bookCharCount={100}
				showCharacterCounter={true}
				showPercentage={true}
				reservePlayerSpace={true}
			/>,
		);

		const footer = view.container.querySelector(
			"[data-reader-progress]",
		) as HTMLElement;
		expect(footer.classList.contains("pointer-events-none")).toBe(true);
		expect(
			view.queryByRole("button", { name: "Toggle progress display" }),
		).toBeNull();

		const copyButton = view.getByRole("button", {
			name: "Copy reading progress: 40 / 100 40.00%",
		});
		expect(copyButton.classList.contains("pointer-events-auto")).toBe(true);
	});
});
