import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReaderPresentation } from "@/features/reader/presentation/reader-presentation";
import {
	defaultReaderSettings,
	getReaderTheme,
} from "@/features/reader/presentation/settings";
import { defaultVisualReaderSettings } from "@/features/reader/presentation/visual-settings";

const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);

const { ReaderQuickSettings } = await import("./reader-quick-settings");

const presentation: ReaderPresentation = {
	readAs: "text",
	resolvedAs: "text",
	textLayout: "scroll",
	visualLayout: "single-page",
	contentKind: "text",
	renderer: "text-scroll",
	supportsVisual: false,
};

function renderPanel(onClose: () => void, isMobile = false) {
	return render(
		<ReaderQuickSettings
			open
			presentation={presentation}
			visualSettings={defaultVisualReaderSettings}
			settings={defaultReaderSettings}
			theme={getReaderTheme(defaultReaderSettings.theme, {})}
			customThemes={{}}
			profiles={[
				{ id: "default", name: "Default", settings: defaultReaderSettings },
			]}
			activeProfileId="default"
			isMobile={isMobile}
			onProfileSwitch={() => {}}
			onProfileCreate={() => {}}
			onProfileRename={() => {}}
			onProfileDuplicate={() => {}}
			onProfileDelete={() => {}}
			onCustomThemesChange={() => {}}
			onChange={() => {}}
			onVisualSettingsChange={() => {}}
			onPresentationChange={() => {}}
			onOpenSettings={() => {}}
			onClose={onClose}
		/>,
	);
}

afterEach(cleanup);

describe("ReaderQuickSettings docked panel", () => {
	test("offers a close button, since the panel has no swipe or tap-outside", () => {
		const onClose = mock(() => {});
		renderPanel(onClose);

		fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
