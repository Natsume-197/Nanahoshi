import "@/test-utils/setup-dom";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReaderPresentation } from "@/features/reader/presentation/reader-presentation";
import {
	defaultReaderSettings,
	getReaderTheme,
	type ReaderSettings,
} from "@/features/reader/presentation/settings";
import { defaultVisualReaderSettings } from "@/features/reader/presentation/visual-settings";

const { cleanup, fireEvent, render } = await import("@testing-library/react");

const { constrainQuickSettingsDialogOffset, ReaderQuickSettings } =
	await import("./reader-quick-settings");

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

beforeEach(() => {
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		value: 1024,
	});
	Object.defineProperty(window, "innerHeight", {
		configurable: true,
		value: 768,
	});
});

afterEach(cleanup);

describe("ReaderQuickSettings desktop dialog", () => {
	test("exposes dialog semantics and a close button", () => {
		const onClose = mock(() => {});
		const panel = renderPanel(onClose);
		const dialog = panel.getByRole("dialog", { name: "Reader settings" });
		const closeButton = panel.getByRole("button", { name: "Close settings" });

		expect(
			panel.container.ownerDocument.querySelector(
				'[data-slot="modal-backdrop"]',
			),
		).toBeNull();
		expect((dialog as HTMLElement).style.willChange).toBe("transform");
		expect(dialog.querySelector("header")?.className).toContain("border-b");
		expect(closeButton.querySelector("svg")?.className.baseVal).toContain(
			"size-3.5",
		);
		fireEvent.click(closeButton);

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test("keeps a dragged window inside the viewport", () => {
		expect(
			constrainQuickSettingsDialogOffset(
				{ x: 900, y: -500 },
				{ x: 0, y: 0 },
				{ left: 224, right: 800, top: 48, bottom: 720 },
				{ width: 1024, height: 768 },
			),
		).toEqual({ x: 208, y: -32 });
	});

	test("keeps background clicks available without closing", () => {
		const onClose = mock(() => {});
		const backgroundButton = document.createElement("button");
		const onBackgroundClick = mock(() => {});
		backgroundButton.addEventListener("click", onBackgroundClick);
		document.body.append(backgroundButton);
		renderPanel(onClose);

		fireEvent.click(backgroundButton);

		expect(onBackgroundClick).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();
	});

	test("tracks pointer movement directly on the floating window", () => {
		const panel = renderPanel(() => {});
		const dialog = panel.getByRole("dialog", { name: "Reader settings" });
		const moveButton = panel.getByRole("button", {
			name: /Move settings window/,
		}) as HTMLButtonElement;
		dialog.getBoundingClientRect = () =>
			({ left: 224, right: 800, top: 48, bottom: 720 }) as DOMRect;
		moveButton.setPointerCapture = () => {};

		fireEvent.pointerDown(moveButton, {
			button: 0,
			clientX: 300,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		});
		fireEvent.pointerMove(moveButton, {
			clientX: 340,
			clientY: 120,
			pointerId: 1,
		});

		expect((dialog as HTMLElement).style.transform).toContain("-50% + 40px");
		expect((dialog as HTMLElement).style.transform).toContain("-50% + 20px");
	});

	test("offers a keyboard path for repositioning and centering", () => {
		const panel = renderPanel(() => {});
		const surface = panel.container.ownerDocument.querySelector(
			"[data-reader-overlay]",
		) as HTMLDivElement;
		surface.getBoundingClientRect = () =>
			({ left: 224, right: 800, top: 48, bottom: 720 }) as DOMRect;
		const moveButton = panel.getByRole("button", {
			name: /Move settings window/,
		});
		const dialog = panel.getByRole("dialog", { name: "Reader settings" });

		fireEvent.keyDown(moveButton, { key: "ArrowRight" });
		expect((dialog as HTMLElement).style.transform).toContain("-50% + 8px");
		fireEvent.keyDown(moveButton, { key: "Home" });
		expect((dialog as HTMLElement).style.transform).toContain("-50% + 0px");
	});

	test("collapses to its title bar and restores its previous height", () => {
		const panel = renderPanel(() => {});
		const dialog = panel.getByRole("dialog", { name: "Reader settings" });
		const surface = dialog as HTMLElement;
		surface.getBoundingClientRect = () => {
			const width = Number.parseFloat(surface.style.width) || 576;
			const height = Number.parseFloat(surface.style.height) || 672;
			return {
				left: 224,
				right: 224 + width,
				top: 48,
				bottom: 48 + height,
				width,
				height,
			} as DOMRect;
		};

		fireEvent.click(
			panel.getByRole("button", { name: "Collapse settings window" }),
		);

		expect(surface.dataset.collapsed).toBe("true");
		expect(surface.style.height).toBe("44px");
		expect(panel.queryByRole("button", { name: "Profiles" })).toBeNull();

		fireEvent.click(
			panel.getByRole("button", { name: "Expand settings window" }),
		);

		expect(surface.dataset.collapsed).toBeUndefined();
		expect(surface.style.height).toBe("672px");
		expect(panel.getByRole("button", { name: "Profiles" })).toBeTruthy();
	});

	test("resizes directly from the bottom-right handle", () => {
		const panel = renderPanel(() => {});
		const dialog = panel.getByRole("dialog", { name: "Reader settings" });
		const resizeButton = panel.getByRole("button", {
			name: /Resize settings window/,
		}) as HTMLButtonElement;
		expect(resizeButton.querySelectorAll("path")).toHaveLength(2);
		dialog.getBoundingClientRect = () =>
			({
				left: 224,
				right: 800,
				top: 48,
				bottom: 720,
				width: 576,
				height: 672,
			}) as DOMRect;
		resizeButton.setPointerCapture = () => {};

		fireEvent.pointerDown(resizeButton, {
			button: 0,
			clientX: 800,
			clientY: 720,
			isPrimary: true,
			pointerId: 2,
		});
		fireEvent.pointerMove(resizeButton, {
			clientX: 880,
			clientY: 740,
			pointerId: 2,
		});

		expect((dialog as HTMLElement).style.width).toBe("656px");
		expect((dialog as HTMLElement).style.height).toBe("692px");
		expect((dialog as HTMLElement).style.transform).toContain("-50% + 40px");
		expect((dialog as HTMLElement).style.transform).toContain("-50% + 10px");
	});

	test("offers a keyboard path for resizing", () => {
		const panel = renderPanel(() => {});
		const dialog = panel.getByRole("dialog", { name: "Reader settings" });
		dialog.getBoundingClientRect = () =>
			({
				left: 224,
				right: 800,
				top: 48,
				bottom: 720,
				width: 576,
				height: 672,
			}) as DOMRect;
		const resizeButton = panel.getByRole("button", {
			name: /Resize settings window/,
		});

		fireEvent.keyDown(resizeButton, { key: "ArrowRight" });

		expect((dialog as HTMLElement).style.width).toBe("584px");
		expect((dialog as HTMLElement).style.transform).toContain("-50% + 4px");
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
