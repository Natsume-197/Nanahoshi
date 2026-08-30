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
const { m } = await import("@/paraglide/messages");
const { setLocale } = await import("@/paraglide/runtime");

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
		profiles?: Array<{
			id: string;
			name: string;
			settings: ReaderSettings;
		}>;
		onProfileCreate?: (name: string) => void;
		onProfileRename?: (id: string, name: string) => void;
		onProfileDuplicate?: (id: string) => void;
		onProfileDelete?: (id: string) => void;
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
			profiles={
				overrides.profiles ?? [
					{ id: "default", name: "Default", settings: defaultReaderSettings },
				]
			}
			activeProfileId="default"
			isMobile={isMobile}
			readListenActive={overrides.readListenActive ?? false}
			onProfileSwitch={() => {}}
			onProfileCreate={overrides.onProfileCreate ?? (() => {})}
			onProfileRename={overrides.onProfileRename ?? (() => {})}
			onProfileDuplicate={overrides.onProfileDuplicate ?? (() => {})}
			onProfileDelete={overrides.onProfileDelete ?? (() => {})}
			onCustomThemesChange={() => {}}
			onChange={overrides.onChange ?? (() => {})}
			onVisualSettingsChange={() => {}}
			onPresentationChange={() => {}}
			onClose={onClose}
		/>,
	);
}

beforeEach(() => {
	setLocale("en", { reload: false });
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
	test("provides reader settings copy in every supported locale", () => {
		setLocale("es", { reload: false });
		expect(m["reader_settings.text_size"]()).toBe("Tamaño del texto");
		expect(m["reader_settings.create_theme"]()).toBe("Crear tema");

		setLocale("ja", { reload: false });
		expect(m["reader_settings.text_size"]()).toBe("文字サイズ");
		expect(m["reader_settings.create_theme"]()).toBe("テーマを作成");
	});

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
		expect(panel.queryByRole("button", { name: "Add" })).toBeNull();

		fireEvent.click(
			panel.getByRole("button", { name: "Expand settings window" }),
		);

		expect(surface.dataset.collapsed).toBeUndefined();
		expect(surface.style.height).toBe("672px");
		expect(panel.getByRole("button", { name: "Add" })).toBeTruthy();
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

	test("keeps profiles outside the settings categories", () => {
		const panel = renderPanel(() => {});

		expect(
			panel.getByRole("heading", { name: "Reading profile" }),
		).toBeTruthy();
		expect(panel.getByRole("button", { name: "Add" })).toBeTruthy();
		expect(
			panel.getByRole("combobox", { name: "Active reading profile" }),
		).toBeTruthy();
		expect(panel.queryByRole("button", { name: "Profiles" })).toBeNull();
	});

	test("layers the profile menu above the floating settings window", () => {
		const panel = renderPanel(() => {});
		const manageButton = panel.getByRole("button", { name: "Manage" });

		fireEvent.click(manageButton);
		const menu = panel.getByRole("menu", { name: "Manage" });
		const positioner = menu.parentElement;

		expect(positioner?.className).toContain("z-[70]");
		fireEvent.click(manageButton);
	});

	test("creates a named profile from an explicit form", () => {
		const onProfileCreate = mock(() => {});
		const panel = renderPanel(() => {}, false, { onProfileCreate });

		fireEvent.click(panel.getByRole("button", { name: "Add" }));
		const input = panel.getByRole("textbox", { name: "Profile name" });
		expect(input.closest('[data-slot="popover-content"]')).toBeTruthy();
		fireEvent.change(input, {
			target: { value: "Night reading" },
		});
		fireEvent.click(panel.getByRole("button", { name: "Create" }));

		expect(onProfileCreate).toHaveBeenCalledWith("Night reading");
		expect(panel.queryByRole("textbox", { name: "Profile name" })).toBeNull();
	});

	test("renames a profile with visible save and cancel actions", () => {
		const onProfileRename = mock(() => {});
		const panel = renderPanel(() => {}, false, { onProfileRename });

		fireEvent.click(panel.getByRole("button", { name: "Manage" }));
		fireEvent.click(panel.getByRole("menuitem", { name: "Rename" }));
		const input = panel.getByRole("textbox", { name: "Profile name" });
		expect(input.closest('[data-slot="popover-content"]')).toBeTruthy();
		fireEvent.change(input, { target: { value: "Focused" } });
		fireEvent.click(panel.getByRole("button", { name: "Save" }));

		expect(onProfileRename).toHaveBeenCalledWith("default", "Focused");
	});

	test("duplicates the active profile from the manage menu", () => {
		const onProfileDuplicate = mock(() => {});
		const panel = renderPanel(() => {}, false, { onProfileDuplicate });

		fireEvent.click(panel.getByRole("button", { name: "Manage" }));
		fireEvent.click(panel.getByRole("menuitem", { name: "Duplicate" }));

		expect(onProfileDuplicate).toHaveBeenCalledWith("default");
	});

	test("confirms before deleting a profile", () => {
		const onProfileDelete = mock(() => {});
		const panel = renderPanel(() => {}, false, {
			onProfileDelete,
			profiles: [
				{ id: "default", name: "Default", settings: defaultReaderSettings },
				{ id: "night", name: "Night", settings: defaultReaderSettings },
			],
		});

		fireEvent.change(
			panel.getByRole("combobox", { name: "Active reading profile" }),
			{ target: { value: "night" } },
		);
		fireEvent.click(panel.getByRole("button", { name: "Manage" }));
		fireEvent.click(panel.getByRole("menuitem", { name: "Delete" }));
		expect(onProfileDelete).not.toHaveBeenCalled();
		expect(
			panel.getByRole("dialog", { name: "Delete “Default”?" }),
		).toBeTruthy();
		expect(panel.getByText(/This action cannot be undone/)).toBeTruthy();

		fireEvent.click(panel.getByRole("button", { name: "Delete profile" }));
		expect(onProfileDelete).toHaveBeenCalledWith("default");
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
