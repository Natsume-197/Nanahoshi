import { describe, expect, it } from "bun:test";
import { getCarouselScrollBehavior } from "../scroll-section";

describe("ScrollSection", () => {
	it("uses instant scrolling when reduced motion is requested", () => {
		expect(getCarouselScrollBehavior(true)).toBe("auto");
		expect(getCarouselScrollBehavior(false)).toBe("smooth");
	});
});
