import "@/test-utils/setup-dom";

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { cloneElement } from "react";
import {
	defaultReaderSettings,
	getReaderTheme,
} from "@/features/reader/presentation/settings";
import { defaultVisualReaderSettings } from "@/features/reader/presentation/visual-settings";
import * as focusSentences from "./focus/focus-sentences";
import { ReaderEngine } from "./reader-engine";

const { cleanup, render } = await import("@testing-library/react");

afterEach(cleanup);

describe("ReaderEngine", () => {
	test("keeps continuous EPUBs on the geometry-preserving engine", () => {
		const prepareFocus = spyOn(focusSentences, "loadFocusDocument");
		const reader = (
			<ReaderEngine
				bookUuid="book"
				presentation={{
					readAs: "text",
					resolvedAs: "text",
					textLayout: "scroll",
					visualLayout: "single-page",
					contentKind: "text",
					renderer: "text-scroll",
					supportsVisual: false,
				}}
				book={{ language: "ja", sections: [] }}
				htmlContent="<p>chapter</p>"
				theme={getReaderTheme(defaultReaderSettings.theme)}
				readerSettings={defaultReaderSettings}
				visualSettings={defaultVisualReaderSettings}
				initialPosition={undefined}
				onPositionChange={() => {}}
				onSectionProgressChange={() => {}}
				onToggleChrome={() => {}}
				onPdfExit={() => {}}
				onPdfCompleteBook={() => {}}
				onPdfFullscreen={() => {}}
				onPdfOpenSettings={() => {}}
				onExitFocus={() => {}}
				navigationBlocked={false}
				reservePlayerSpace={false}
				scrollContainerRef={{ current: null }}
				controllerRef={() => {}}
				lazyBook={{} as never}
			/>
		);

		const result = render(reader);
		expect(prepareFocus).not.toHaveBeenCalled();
		expect(
			result.container.querySelector('[data-reader-renderer="text-scroll"]'),
		).not.toBeNull();
		result.rerender(
			cloneElement(reader, {
				lazyBook: undefined,
				presentation: {
					...reader.props.presentation,
					renderer: "text-paginated",
					textLayout: "paginated",
				},
			}),
		);
		expect(prepareFocus).not.toHaveBeenCalled();
		result.rerender(
			cloneElement(reader, {
				lazyBook: undefined,
				presentation: {
					...reader.props.presentation,
					renderer: "text-focus",
					textLayout: "focus",
				},
			}),
		);
		expect(prepareFocus).toHaveBeenCalledTimes(1);
		prepareFocus.mockRestore();
	});
});
