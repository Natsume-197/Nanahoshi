import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReaderPresentation } from "@/features/reader/presentation/reader-presentation";
import {
	defaultReaderSettings,
	getReaderTheme,
	type ReaderSettings,
} from "@/features/reader/presentation/settings";
import { defaultVisualReaderSettings } from "@/features/reader/presentation/visual-settings";

const { cleanup, fireEvent, render } = await import("@testing-library/react");

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

function renderPanel(
	onClose: () => void,
	isMobile = false,
	overrides: {
		presentation?: ReaderPresentation;
		settings?: ReaderSettings;
		readListenActive?: boolean;
		onChange?: (patch: Partial<ReaderSettings>) => void;
	} = {},
) {
	const panelSettings = overrides.settings ?? defaultReaderSettings;
	return render(
		<ReaderQuickSettings
			open
			presentation={overrides.presentation ?? presentation}
			visualSettings={defaultVisualReaderSettings}
			settings={panelSettings}
			theme={getReaderTheme(panelSettings.theme, {})}
			customThemes={{}}
			profiles={[
				{ id: "default", name: "Default", settings: defaultReaderSettings },
			]}
			activeProfileId="default"
			isMobile={isMobile}
			readListenActive={overrides.readListenActive ?? false}
			onProfileSwitch={() => {}}
			onProfileCreate={() => {}}
			onProfileRename={() => {}}
			onProfileDuplicate={() => {}}
			onProfileDelete={() => {}}
			onCustomThemesChange={() => {}}
			onChange={overrides.onChange ?? (() => {})}
			onVisualSettingsChange={() => {}}
			onPresentationChange={() => {}}
			onClose={onClose}
		/>,
	);
}

afterEach(cleanup);

describe("ReaderQuickSettings docked panel", () => {
	test("offers a close button, since the panel has no swipe or tap-outside", () => {
		const onClose = mock(() => {});
		const panel = renderPanel(onClose);

		fireEvent.click(panel.getByRole("button", { name: "Close settings" }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("removes Advanced settings from the category list", () => {
		const panel = renderPanel(() => {});

		expect(panel.queryByText("Advanced settings")).toBeNull();
	});

	test("hides Read as when text is the only supported content type", () => {
		const panel = renderPanel(() => {});

		fireEvent.click(panel.getByRole("button", { name: "Layout" }));

		expect(panel.queryByText("Read as")).toBeNull();
	});

	test("moves paginated reader controls into Layout", () => {
		const panel = renderPanel(() => {}, false, {
			presentation: {
				...presentation,
				textLayout: "paginated",
				renderer: "text-paginated",
				supportsVisual: true,
			},
		});

		fireEvent.click(panel.getByRole("button", { name: "Layout" }));

		expect(panel.getByText("Read as")).toBeTruthy();
		expect(panel.getByText("Avoid page break")).toBeTruthy();
	});

	test("moves vertical typography controls into Text", () => {
		const panel = renderPanel(() => {}, false, {
			settings: {
				...defaultReaderSettings,
				writingMode: "vertical-rl",
			},
		});

		fireEvent.click(panel.getByRole("button", { name: "Text" }));

		expect(panel.getByText("Sans font family")).toBeTruthy();
		expect(panel.getByText("Latin character orientation")).toBeTruthy();
		expect(panel.getByText("Font kerning")).toBeTruthy();
		expect(panel.getByText("Proportional vertical metrics")).toBeTruthy();
	});

	test("offers line-by-line audio playback only in Read & Listen focus mode", () => {
		const onChange = mock(() => {});
		const panel = renderPanel(() => {}, false, {
			presentation: {
				...presentation,
				textLayout: "focus",
				renderer: "text-focus",
			},
			readListenActive: true,
			onChange,
		});

		fireEvent.click(panel.getByRole("button", { name: "Layout" }));
		const label = panel.getByText("Line-by-line audio (VN)");
		const row = label.closest("div");
		const toggle = Array.from(row?.querySelectorAll("button") ?? []).find(
			(button) => button.textContent === "On",
		);
		if (!toggle) throw new Error("Missing line playback toggle");
		fireEvent.click(toggle);

		expect(onChange).toHaveBeenCalledWith({
			focusPauseAudioAfterLine: true,
		});
	});
});
