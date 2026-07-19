import "@/test-utils/setup-dom";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { applyPaletteVars } from "../theme-palettes";
import { cancelThemePreview, previewTheme } from "../theme-preview";

let nextFrameId = 1;
let frames = new Map<number, FrameRequestCallback>();

function flushAnimationFrame(time = 16) {
	const pending = [...frames.entries()];
	frames = new Map();
	for (const [, callback] of pending) callback(time);
}

beforeEach(() => {
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
});

afterEach(() => {
	cancelThemePreview();
	applyPaletteVars(null);
	document.documentElement.classList.remove("dark");
});

describe("theme preview scheduler", () => {
	it("coalesces rapid changes and applies only the latest frame", () => {
		let firstBuilds = 0;
		let latestBuilds = 0;

		previewTheme(() => {
			firstBuilds += 1;
			return { base: "light", vars: { "--background": "#ffffff" } };
		});
		previewTheme(() => {
			latestBuilds += 1;
			return { base: "dark", vars: { "--background": "#101014" } };
		});

		expect(firstBuilds).toBe(0);
		expect(latestBuilds).toBe(0);
		expect(frames.size).toBe(1);

		flushAnimationFrame();

		expect(firstBuilds).toBe(0);
		expect(latestBuilds).toBe(1);
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(
			document.documentElement.style.getPropertyValue("--background"),
		).toBe("#101014");
	});

	it("cancels a pending preview before it mutates the document", () => {
		previewTheme(() => ({
			base: "dark",
			vars: { "--background": "#101014" },
		}));

		cancelThemePreview();
		flushAnimationFrame();

		expect(frames.size).toBe(0);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
		expect(
			document.documentElement.style.getPropertyValue("--background"),
		).toBe("");
	});
});
