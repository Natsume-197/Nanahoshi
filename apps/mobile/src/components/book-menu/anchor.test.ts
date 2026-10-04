import { expect, test } from "bun:test";
import { measureMenuAnchor } from "./anchor";

test("menu measurement uses a view reference and ignores unmounted sources", () => {
	let measured: unknown;
	const source = {
		measureInWindow: (
			callback: (x: number, y: number, width: number, height: number) => void,
		) => callback(20, 100, 120, 180),
	};
	measureMenuAnchor(source, (anchor) => {
		measured = anchor;
	});
	expect(measured).toEqual({ x: 20, y: 100, width: 120, height: 180 });
	measureMenuAnchor(null, () => {
		throw new Error("Unmounted source must not open a menu");
	});
});
