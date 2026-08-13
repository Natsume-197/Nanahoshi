import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { miniPlayerBarLayer } from "./mini-player-motion";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

describe("expanded player motion", () => {
	it("exposes the miniplayer as soon as closing starts", () => {
		expect(miniPlayerBarLayer(true)).toBe("z-30");
		expect(miniPlayerBarLayer(false)).toBe("z-[41]");
	});

	it("uses an interruptible transform transition in both directions", () => {
		expect(css).toContain('.expanded-player-sheet[data-expanded="false"]');
		expect(css).toContain("--expanded-player-open-dur: 280ms");
		expect(css).toContain("--expanded-player-close-dur: 220ms");
		expect(css).toContain("transition-property: transform");
	});
});
