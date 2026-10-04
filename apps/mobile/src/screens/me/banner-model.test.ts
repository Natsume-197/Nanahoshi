import { describe, expect, test } from "bun:test";
import { bannerFrame } from "./banner-model";

const REST = 220;
const BAR = 80;

describe("bannerFrame", () => {
	test("at rest the banner is whole, sharp and in front of nothing", () => {
		const frame = bannerFrame(0, REST, BAR);
		expect(frame.height).toBe(REST);
		expect(frame.progress).toBe(0);
		expect(frame.pinned).toBe(false);
		expect(frame.avatarScale).toBe(1);
	});

	test("shrinks with the page, then pins at the bar's height", () => {
		expect(bannerFrame(70, REST, BAR).height).toBe(150);
		expect(bannerFrame(70, REST, BAR).pinned).toBe(false);
		const pinned = bannerFrame(140, REST, BAR);
		expect(pinned.height).toBe(BAR);
		expect(pinned.pinned).toBe(true);
		expect(bannerFrame(2000, REST, BAR).height).toBe(BAR);
	});

	test("blur, scrim and avatar shrink finish exactly when it pins", () => {
		const half = bannerFrame(70, REST, BAR);
		expect(half.progress).toBeCloseTo(0.5);
		const pinned = bannerFrame(140, REST, BAR);
		expect(pinned.progress).toBe(1);
		expect(pinned.avatarScale).toBeCloseTo(0.5);
		expect(bannerFrame(900, REST, BAR)).toEqual(pinned);
	});

	test("pulling past the top stretches instead of opening a gap", () => {
		const pulled = bannerFrame(-60, REST, BAR);
		expect(pulled.height).toBe(REST + 60);
		expect(pulled.scale).toBeGreaterThan(1);
		expect(pulled.progress).toBe(0);
	});
});
