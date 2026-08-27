import "@/test-utils/setup-dom";

import { afterEach, describe, expect, test } from "bun:test";
import {
	defaultReaderSettings,
	getReaderTheme,
} from "@/features/reader/presentation/settings";
import { defaultVisualReaderSettings } from "@/features/reader/presentation/visual-settings";
import { ReaderEngine } from "./reader-engine";

const { cleanup, render } = await import("@testing-library/react");

afterEach(cleanup);

describe("ReaderEngine", () => {
	test("keeps continuous EPUBs on the geometry-preserving engine", () => {
		const result = render(
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
			/>,
		);

		expect(
			result.container.querySelector('[data-reader-renderer="text-scroll"]'),
		).not.toBeNull();
	});
});
