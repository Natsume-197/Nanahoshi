import { describe, expect, test } from "bun:test";
import { constrainFloatingWindowOffset } from "./use-floating-window-drag";

describe("floating window drag", () => {
	test("keeps a dragged window inside the viewport", () => {
		expect(
			constrainFloatingWindowOffset(
				{ x: 900, y: -500 },
				{ x: 0, y: 0 },
				{ left: 256, right: 768, top: 48, bottom: 720 },
				{ width: 1024, height: 768 },
			),
		).toEqual({ x: 240, y: -32 });
	});

	test("keeps the title bar reachable when the window is taller than the viewport", () => {
		const offset = constrainFloatingWindowOffset(
			{ x: 0, y: -500 },
			{ x: 0, y: 0 },
			{ left: 256, right: 768, top: -16, bottom: 784 },
			{ width: 1024, height: 768 },
		);

		expect(offset.y).toBe(32);
	});
});
