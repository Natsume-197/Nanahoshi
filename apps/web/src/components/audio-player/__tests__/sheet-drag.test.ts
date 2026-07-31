import { describe, expect, test } from "bun:test";
import {
	blendVelocity,
	projectMomentum,
	releaseDuration,
	rubberBand,
	sheetOffset,
	shouldDismissSheet,
} from "@/components/audio-player/sheet-drag";

const HEIGHT = 800;

describe("sheetOffset", () => {
	test("follows the finger exactly on the way down", () => {
		expect(sheetOffset(0)).toBe(0);
		expect(sheetOffset(240)).toBe(240);
	});

	test("resists above the top instead of stopping dead", () => {
		const pulled = sheetOffset(-40);
		expect(pulled).toBeLessThan(0);
		expect(pulled).toBeGreaterThan(-40);
	});

	test("resists harder the further it is pulled", () => {
		const near = -sheetOffset(-40) / 40;
		const far = -sheetOffset(-400) / 400;
		expect(far).toBeLessThan(near);
	});

	test("never runs away, however hard it is yanked", () => {
		expect(sheetOffset(-100_000)).toBeGreaterThan(-100);
	});
});

describe("rubberBand", () => {
	test("approaches the limit without reaching it", () => {
		expect(rubberBand(1_000_000, 72)).toBeLessThan(72);
		expect(rubberBand(1_000_000, 72)).toBeGreaterThan(71);
	});
});

describe("projectMomentum", () => {
	test("carries a throw forward, and a backwards throw backwards", () => {
		expect(projectMomentum(1)).toBeGreaterThan(0);
		expect(projectMomentum(-1)).toBeLessThan(0);
		expect(projectMomentum(0)).toBe(0);
	});

	test("projects further the faster the release", () => {
		expect(projectMomentum(2)).toBeGreaterThan(projectMomentum(0.5));
	});
});

describe("shouldDismissSheet", () => {
	test("holds on a nudge", () => {
		expect(shouldDismissSheet(40, 0, HEIGHT)).toBe(false);
	});

	test("dismisses on a slow drag past the commit point", () => {
		expect(shouldDismissSheet(HEIGHT * 0.4, 0, HEIGHT)).toBe(true);
	});

	test("dismisses on a flick from near the top", () => {
		expect(shouldDismissSheet(30, 1.2, HEIGHT)).toBe(true);
	});

	test("snaps home when the finger flicks back up, however far it got", () => {
		expect(shouldDismissSheet(HEIGHT * 0.45, -1.2, HEIGHT)).toBe(false);
	});

	test("scales with the panel: the same drag commits on a short screen", () => {
		expect(shouldDismissSheet(200, 0, HEIGHT)).toBe(false);
		expect(shouldDismissSheet(200, 0, 480)).toBe(true);
	});
});

describe("releaseDuration", () => {
	test("inherits the release speed: a flick settles faster than a crawl", () => {
		expect(releaseDuration(300, 1.5)).toBeLessThan(releaseDuration(300, 0.2));
	});

	test("stays within bounds for an absurd flick and for a dead stop", () => {
		expect(releaseDuration(300, 50)).toBeGreaterThanOrEqual(160);
		expect(releaseDuration(300, 0.0001)).toBeLessThanOrEqual(420);
	});

	test("has a resting time when there is no speed to inherit", () => {
		expect(releaseDuration(300, 0)).toBe(280);
	});

	test("reads speed, not direction", () => {
		expect(releaseDuration(300, -0.8)).toBe(releaseDuration(300, 0.8));
	});
});

describe("blendVelocity", () => {
	test("weights the newest sample without discarding the last", () => {
		expect(blendVelocity(0, 1)).toBeGreaterThan(0.5);
		expect(blendVelocity(0, 1)).toBeLessThan(1);
	});

	test("a flick at the end of a still drag still registers", () => {
		expect(blendVelocity(0, 1.4)).toBeGreaterThan(0.9);
	});
});
