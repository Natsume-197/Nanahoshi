import { describe, expect, it } from "bun:test";
import { miniPlayerBarLayer } from "./mini-player-motion";

describe("expanded player motion", () => {
	it("keeps the miniplayer behind the panel until closing finishes", () => {
		expect(miniPlayerBarLayer(true, true)).toBe("z-30");
		expect(miniPlayerBarLayer(false, true)).toBe("z-30");
		expect(miniPlayerBarLayer(false, false)).toBe("z-[41]");
	});
});
