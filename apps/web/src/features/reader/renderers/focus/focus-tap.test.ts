import { describe, expect, test } from "bun:test";
import { focusTapDirection } from "./focus-tap";

const surface = { left: 0, width: 1000 };

describe("focus tap direction", () => {
	test("horizontal books go back from the left edge and forward elsewhere", () => {
		const tap = (clientX: number) =>
			focusTapDirection({ ...surface, clientX, verticalMode: false });

		expect(tap(50)).toBe(-1);
		expect(tap(199)).toBe(-1);
		expect(tap(201)).toBe(1);
		expect(tap(980)).toBe(1);
	});

	test("vertical books mirror it: reading starts at the right", () => {
		const tap = (clientX: number) =>
			focusTapDirection({ ...surface, clientX, verticalMode: true });

		expect(tap(950)).toBe(-1);
		expect(tap(801)).toBe(-1);
		expect(tap(799)).toBe(1);
		expect(tap(20)).toBe(1);
	});

	test("the zone follows the surface, not the viewport", () => {
		expect(
			focusTapDirection({
				left: 400,
				width: 200,
				clientX: 420,
				verticalMode: false,
			}),
		).toBe(-1);
		expect(
			focusTapDirection({
				left: 400,
				width: 200,
				clientX: 380,
				verticalMode: false,
			}),
		).toBe(-1);
	});
});
