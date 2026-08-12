import { describe, expect, test } from "bun:test";
import { buildContinuousReaderSizing } from "./reader-style";

describe("buildContinuousReaderSizing", () => {
	test("fills the horizontal viewport while clipping publication overflow", () => {
		expect(buildContinuousReaderSizing(false, 640)).toEqual({
			boxSizing: "border-box",
			width: "100%",
			minWidth: 0,
			maxWidth: "640px",
			overflowX: "clip",
		});
	});

	test("keeps the horizontal reading axis unconstrained in vertical text", () => {
		expect(buildContinuousReaderSizing(true, 640)).toEqual({
			maxHeight: "640px",
		});
	});
});
