import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
	applyRadius,
	getStoredRadius,
	RADIUS_MAX,
	RADIUS_MIN,
	readEffectiveRadius,
	storeRadius,
} from "./theme-radius";

// The module reads window/document directly. Stub the globals in place and
// restore them after, so the shared bun process isn't polluted for other files.
const originalWindow = Reflect.get(globalThis, "window");
const originalDocument = Reflect.get(globalThis, "document");
const originalGetComputedStyle = Reflect.get(globalThis, "getComputedStyle");

let store: Map<string, string>;
let inlineStyle: Map<string, string>;
let computedRadius: string;

beforeEach(() => {
	store = new Map();
	inlineStyle = new Map();
	computedRadius = "0.2rem";

	Reflect.set(globalThis, "window", {
		localStorage: {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k),
		},
	});
	Reflect.set(globalThis, "document", {
		documentElement: {
			style: {
				setProperty: (k: string, v: string) => void inlineStyle.set(k, v),
				removeProperty: (k: string) => void inlineStyle.delete(k),
			},
		},
	});
	Reflect.set(globalThis, "getComputedStyle", () => ({
		getPropertyValue: () => computedRadius,
	}));
});

afterAll(() => {
	Reflect.set(globalThis, "window", originalWindow);
	Reflect.set(globalThis, "document", originalDocument);
	Reflect.set(globalThis, "getComputedStyle", originalGetComputedStyle);
});

describe("getStoredRadius", () => {
	test("is null when nothing is stored, so the theme default wins", () => {
		expect(getStoredRadius()).toBeNull();
	});

	test("reads a stored value", () => {
		store.set("theme-radius", "0.65");
		expect(getStoredRadius()).toBe(0.65);
	});

	test("clamps values written outside the slider range", () => {
		store.set("theme-radius", "9");
		expect(getStoredRadius()).toBe(RADIUS_MAX);
		store.set("theme-radius", "-3");
		expect(getStoredRadius()).toBe(RADIUS_MIN);
	});

	test("treats unparseable storage as no override", () => {
		store.set("theme-radius", "not-a-number");
		expect(getStoredRadius()).toBeNull();
	});

	test("keeps an explicit 0 instead of falling back", () => {
		store.set("theme-radius", "0");
		expect(getStoredRadius()).toBe(0);
	});
});

describe("storeRadius", () => {
	test("persists a clamped value", () => {
		storeRadius(5);
		expect(store.get("theme-radius")).toBe(String(RADIUS_MAX));
	});

	test("null clears the override", () => {
		store.set("theme-radius", "0.4");
		storeRadius(null);
		expect(store.has("theme-radius")).toBe(false);
	});
});

describe("applyRadius", () => {
	test("writes rem onto the root element", () => {
		applyRadius(0.75);
		expect(inlineStyle.get("--radius")).toBe("0.75rem");
	});

	test("clamps before writing", () => {
		applyRadius(99);
		expect(inlineStyle.get("--radius")).toBe(`${RADIUS_MAX}rem`);
	});

	test("null removes the inline override so the stylesheet applies", () => {
		applyRadius(0.75);
		applyRadius(null);
		expect(inlineStyle.has("--radius")).toBe(false);
	});
});

describe("readEffectiveRadius", () => {
	test("parses the value currently in effect", () => {
		computedRadius = "0.85rem";
		expect(readEffectiveRadius()).toBe(0.85);
	});

	test("falls back when the computed value is unusable", () => {
		computedRadius = "";
		expect(readEffectiveRadius(0.5)).toBe(0.5);
	});
});
