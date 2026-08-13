import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { miniPlayerBarLayer } from "./mini-player-motion";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
const playerBar = readFileSync(
	new URL("./player-bar.tsx", import.meta.url),
	"utf8",
);
const miniPlayer = readFileSync(
	new URL("./mini-player.tsx", import.meta.url),
	"utf8",
);
const expandedPlayer = readFileSync(
	new URL("./expanded-player.tsx", import.meta.url),
	"utf8",
);
const playerMoreMenu = readFileSync(
	new URL("./player-more-menu.tsx", import.meta.url),
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

	it("disables pull-to-refresh only while the expanded player is open", () => {
		expect(miniPlayer).toContain("{isExpanded && <DisablePullToRefresh />}");
		expect(css).toContain("html.expanded-player-open body");
		expect(css).toContain("overscroll-behavior-y: none");
	});

	it("adds a little more compact-screen breathing room", () => {
		expect(expandedPlayer).toContain(
			"overflow-hidden px-6 py-5 md:px-8 md:py-6",
		);
	});

	it("optically aligns the lower control row with the header controls", () => {
		expect(expandedPlayer).toContain("-mx-2 flex w-[calc(100%+1rem)]");
	});

	it("balances the player and side panel across wide screens", () => {
		expect(expandedPlayer).toContain("lg:max-w-[80rem]");
		expect(expandedPlayer).toContain(
			"lg:grid-cols-[minmax(28rem,1.1fr)_minmax(24rem,0.9fr)]",
		);
		expect(expandedPlayer).not.toContain("xl:h-full xl:w-auto xl:max-w-full");
	});

	it("uses the app Drawer for the expanded player's mobile settings", () => {
		expect(playerMoreMenu).toContain("<Drawer");
		expect(playerMoreMenu).toContain("showSwipeHandle");
		expect(playerMoreMenu).toContain("<DrawerContent");
		expect(playerMoreMenu).toContain(
			'overlayClassName="supports-backdrop-filter:backdrop-blur-none"',
		);
		expect(playerMoreMenu).not.toContain("<Sheet");
	});
});
