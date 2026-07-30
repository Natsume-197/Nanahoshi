import { describe, expect, it } from "bun:test";
import {
	clampSpeed,
	clampVolume,
	DEFAULT_JUMP_BACK,
	formatSpeed,
	MAX_SPEED,
	MIN_SPEED,
	normalizeJumpAmount,
	nudgeSpeed,
} from "../player-preferences";

describe("clampSpeed", () => {
	it("keeps a supported rate", () => {
		expect(clampSpeed(1.25)).toBe(1.25);
	});

	it("clamps outside the range", () => {
		expect(clampSpeed(0.1)).toBe(MIN_SPEED);
		expect(clampSpeed(12)).toBe(MAX_SPEED);
	});

	it("falls back to 1 for garbage", () => {
		expect(clampSpeed(Number.NaN)).toBe(1);
	});
});

describe("nudgeSpeed", () => {
	it("steps by a tenth without float noise", () => {
		expect(nudgeSpeed(1.1, 1)).toBe(1.2);
		expect(nudgeSpeed(1.3, -1)).toBe(1.2);
	});

	it("stops at the bounds", () => {
		expect(nudgeSpeed(MIN_SPEED, -1)).toBe(MIN_SPEED);
		expect(nudgeSpeed(MAX_SPEED, 1)).toBe(MAX_SPEED);
	});
});

describe("formatSpeed", () => {
	it("drops the decimal for whole rates", () => {
		expect(formatSpeed(1)).toBe("1×");
		expect(formatSpeed(2)).toBe("2×");
	});

	it("keeps fractional rates", () => {
		expect(formatSpeed(1.25)).toBe("1.25×");
	});
});

describe("normalizeJumpAmount", () => {
	it("accepts the supported amounts as strings or numbers", () => {
		expect(normalizeJumpAmount("30", DEFAULT_JUMP_BACK)).toBe(30);
		expect(normalizeJumpAmount(15, DEFAULT_JUMP_BACK)).toBe(15);
	});

	it("falls back for anything else", () => {
		expect(normalizeJumpAmount("7", DEFAULT_JUMP_BACK)).toBe(DEFAULT_JUMP_BACK);
		expect(normalizeJumpAmount(null, DEFAULT_JUMP_BACK)).toBe(
			DEFAULT_JUMP_BACK,
		);
	});
});

describe("clampVolume", () => {
	it("keeps a level inside the range", () => {
		expect(clampVolume(0.4)).toBe(0.4);
	});

	it("clamps outside it and recovers from garbage", () => {
		expect(clampVolume(-1)).toBe(0);
		expect(clampVolume(3)).toBe(1);
		expect(clampVolume(Number.NaN)).toBe(1);
	});
});
