import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { miniPlayerBarLayer } from "./mini-player-motion";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
const playerBar = readFileSync(
	new URL("./player-bar.tsx", import.meta.url),
	"utf8",
);

describe("expanded player motion", () => {
	it("keeps the miniplayer behind the panel until closing finishes", () => {
		expect(miniPlayerBarLayer(true, true)).toBe("z-30");
		expect(miniPlayerBarLayer(false, true)).toBe("z-30");
		expect(miniPlayerBarLayer(false, false)).toBe("z-[41]");
	});

	it("uses an interruptible transform transition in both directions", () => {
		expect(css).toContain('.expanded-player-sheet[data-expanded="false"]');
		expect(css).toContain("--expanded-player-open-dur: 400ms");
		expect(css).toContain("--expanded-player-close-dur: 350ms");
		expect(css).toContain("--expanded-player-ease: var(--ease-smooth-out)");
		expect(css).toContain("transition-property: transform");
	});

	it("reopens on press without waiting for click release", () => {
		expect(playerBar).toContain("onPointerDown={expand}");
	});
});
