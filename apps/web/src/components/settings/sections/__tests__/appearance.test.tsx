import "@/test-utils/setup-dom";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { storeHideCardText } from "@/hooks/use-card-display-preferences";
import {
	applyPaletteVars,
	buildCustomPalette,
	buildGradientPalette,
	buildSeedPalette,
	DEFAULT_CUSTOM_INPUT,
	DEFAULT_GRADIENT_INPUT,
	DEFAULT_SEED_INPUT,
	getStoredPalette,
	storePalette,
} from "@/lib/theme-palettes";
import { cancelThemePreview } from "@/lib/theme-preview";
import { m } from "@/paraglide/messages";
import { AppearanceSettings } from "../appearance";

let nextFrameId = 1;
let frames = new Map<number, FrameRequestCallback>();

function flushAnimationFrame(time = 16) {
	const pending = [...frames.entries()];
	frames = new Map();
	for (const [, callback] of pending) callback(time);
}

beforeEach(() => {
	storePalette(null);
	storeHideCardText(false);
	nextFrameId = 1;
	frames = new Map();
	globalThis.requestAnimationFrame = (callback) => {
		const id = nextFrameId;
		nextFrameId += 1;
		frames.set(id, callback);
		return id;
	};
	globalThis.cancelAnimationFrame = (id) => {
		frames.delete(id);
	};
	window.matchMedia = () =>
		({
			matches: false,
			media: "",
			onchange: null,
			addListener: () => undefined,
			removeListener: () => undefined,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			dispatchEvent: () => false,
		}) as MediaQueryList;
});

afterEach(() => {
	cleanup();
	cancelThemePreview();
	storePalette(null);
	storeHideCardText(false);
	applyPaletteVars(null);
	document.documentElement.classList.remove("dark", "theme-changing");
});

describe("AppearanceSettings dashboard cards", () => {
	it("persists whether card titles and subtitles are shown", () => {
		const { getByRole } = render(<AppearanceSettings />);
		const control = getByRole("switch", {
			name: m["settings.appearance.card_text"](),
		});

		expect(control.getAttribute("data-checked")).not.toBeNull();
		fireEvent.click(control);

		expect(window.localStorage.getItem("nanahoshi-hide-card-text")).toBe(
			"true",
		);
		expect(control.getAttribute("data-unchecked")).not.toBeNull();
	});
});

describe("AppearanceSettings palette mode initialization", () => {
	it("opens Gradient when no custom palette is stored", () => {
		const { getByRole } = render(<AppearanceSettings />);

		expect(
			getByRole("button", {
				name: m["settings.appearance.custom_mode_gradient"](),
			}).getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("reopens One color with its stored seed", () => {
		storePalette(
			buildSeedPalette({
				...DEFAULT_SEED_INPUT.light,
				seed: "#88c0d0",
				radius: 0.8,
			}),
		);

		const { getAllByRole, getByRole } = render(<AppearanceSettings />);

		expect(
			getByRole("button", {
				name: m["settings.appearance.custom_mode_seed"](),
			}).getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			document.querySelector('input[type="color"][value="#88c0d0"]'),
		).not.toBeNull();
		const baseSelector = getByRole("group", {
			name: m["settings.appearance.base"](),
		});
		const lightBaseButton = getAllByRole("button", {
			name: m["settings.appearance.theme_light"](),
		}).find((button) => baseSelector.contains(button));
		expect(lightBaseButton?.getAttribute("aria-pressed")).toBe("true");
		const radiusControl = getByRole("group", {
			name: m["settings.appearance.corner_radius"](),
		});
		expect(
			(radiusControl.querySelector('input[type="range"]') as HTMLInputElement)
				.value,
		).toBe("0.8");
	});

	it("reopens Gradient for a stored gradient recipe", () => {
		storePalette(buildGradientPalette(DEFAULT_GRADIENT_INPUT.light));

		const { getByRole } = render(<AppearanceSettings />);

		expect(
			getByRole("button", {
				name: m["settings.appearance.custom_mode_gradient"](),
			}).getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("reopens Advanced for a stored custom recipe", () => {
		storePalette(buildCustomPalette(DEFAULT_CUSTOM_INPUT.light));

		const { getByRole } = render(<AppearanceSettings />);

		expect(
			getByRole("button", {
				name: m["settings.appearance.custom_mode_advanced"](),
			}).getAttribute("aria-pressed"),
		).toBe("true");
	});
});

describe("AppearanceSettings One color workflow", () => {
	it("preserves independent Seed and Gradient drafts while switching modes", () => {
		storePalette(
			buildSeedPalette({
				...DEFAULT_SEED_INPUT.dark,
				seed: "#88c0d0",
			}),
		);
		const { getAllByRole, getByLabelText, getByRole } = render(
			<AppearanceSettings />,
		);

		const baseSelector = getByRole("group", {
			name: m["settings.appearance.base"](),
		});
		const lightBaseButton = getAllByRole("button", {
			name: m["settings.appearance.theme_light"](),
		}).find((button) => baseSelector.contains(button));
		fireEvent.click(lightBaseButton as HTMLButtonElement);
		fireEvent.click(
			getByRole("button", {
				name: m["settings.appearance.custom_mode_gradient"](),
			}),
		);
		fireEvent.click(
			getByRole("button", {
				name: m["settings.appearance.gradient_add_color"](),
			}),
		);

		fireEvent.click(
			getByRole("button", {
				name: m["settings.appearance.custom_mode_seed"](),
			}),
		);
		expect(lightBaseButton?.getAttribute("aria-pressed")).toBe("true");
		expect(
			(
				getByLabelText(
					m["settings.appearance.color_seed"](),
				) as HTMLInputElement
			).value,
		).toBe("#88c0d0");

		fireEvent.click(
			getByRole("button", {
				name: m["settings.appearance.custom_mode_gradient"](),
			}),
		);
		expect(
			getByRole("button", {
				name: `${m["settings.appearance.gradient_colors"]()} 4`,
			}),
		).toBeDefined();
	});

	it("persists only the active Seed recipe when applied", () => {
		storePalette(
			buildSeedPalette({
				...DEFAULT_SEED_INPUT.dark,
				seed: "#5e81ac",
			}),
		);
		const { getByRole } = render(<AppearanceSettings />);

		fireEvent.click(
			getByRole("button", { name: m["settings.appearance.apply"]() }),
		);

		const stored = getStoredPalette();
		expect(stored?.seed).toEqual({
			...DEFAULT_SEED_INPUT.dark,
			seed: "#5e81ac",
		});
		expect(stored?.gradient).toBeUndefined();
		expect(stored?.custom).toBeUndefined();
	});

	it("restores the committed palette after an unapplied Seed preview", () => {
		const committed = buildGradientPalette({
			...DEFAULT_GRADIENT_INPUT.dark,
			intensity: 27,
		});
		storePalette(committed);
		applyPaletteVars(committed.vars);
		const storedBeforePreview = window.localStorage.getItem("theme-palette");
		const { getByRole, unmount } = render(<AppearanceSettings />);

		fireEvent.click(
			getByRole("button", {
				name: m["settings.appearance.custom_mode_seed"](),
			}),
		);
		act(() => flushAnimationFrame());
		expect(
			document.documentElement.style.getPropertyValue("--theme-gradient"),
		).toBe("");

		unmount();

		expect(window.localStorage.getItem("theme-palette")).toBe(
			storedBeforePreview,
		);
		expect(
			document.documentElement.style.getPropertyValue("--theme-gradient"),
		).toBe(committed.vars["--theme-gradient"] ?? "");
	});
});
