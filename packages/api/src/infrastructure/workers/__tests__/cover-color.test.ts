import { describe, expect, test } from "bun:test";
import { selectCoverColor } from "../cover-color";

function pixels(colors: Array<[number, number, number]>) {
	return Uint8Array.from(colors.flat());
}

describe("selectCoverColor", () => {
	test("prefers a meaningful color region over a single vivid pixel", () => {
		const data = pixels([
			...[...Array(18)].map(() => [45, 105, 170] as [number, number, number]),
			[255, 0, 255],
		]);
		expect(selectCoverColor(data)).toBe("#2d69aa");
	});

	test("ignores a large paper-white background when an accent is present", () => {
		const data = pixels([
			...[...Array(30)].map(() => [250, 250, 248] as [number, number, number]),
			...[...Array(10)].map(() => [225, 65, 45] as [number, number, number]),
		]);
		expect(selectCoverColor(data)).toBe("#e1412d");
	});

	test("prefers an interesting accent over a larger muted region", () => {
		const data = pixels([
			...[...Array(40)].map(() => [126, 116, 108] as [number, number, number]),
			...[...Array(9)].map(() => [28, 138, 210] as [number, number, number]),
		]);
		expect(selectCoverColor(data)).toBe("#1c8ad2");
	});

	test("returns a stable neutral for grayscale covers", () => {
		const data = pixels([
			...[...Array(12)].map(() => [42, 42, 42] as [number, number, number]),
			...[...Array(20)].map(() => [168, 168, 168] as [number, number, number]),
		]);
		expect(selectCoverColor(data)).toBe("#a8a8a8");
	});

	test("handles empty input", () => {
		expect(selectCoverColor(new Uint8Array())).toBeNull();
	});
});
