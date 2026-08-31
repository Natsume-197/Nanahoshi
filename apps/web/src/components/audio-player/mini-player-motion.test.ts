import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { miniPlayerBarLayer } from "./mini-player-motion";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
const playerBar = readFileSync(
	new URL("./player-bar.tsx", import.meta.url),
	"utf8",
);
const playerTransport = readFileSync(
	new URL("./player-transport.tsx", import.meta.url),
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
const readerRoute = readFileSync(
	new URL("../../routes/reader/$uuid.tsx", import.meta.url),
	"utf8",
);
const dashboardLayout = readFileSync(
	new URL("../layout/dashboard-layout.tsx", import.meta.url),
	"utf8",
);
const readListenRuntime = readFileSync(
	new URL("../read-listen/read-listen-runtime.tsx", import.meta.url),
	"utf8",
);
const readListenPlayer = readFileSync(
	new URL("./read-listen-player.tsx", import.meta.url),
	"utf8",
);

describe("expanded player motion", () => {
	it("keeps the miniplayer behind the panel until closing finishes", () => {
		expect(miniPlayerBarLayer(true, true)).toBe("z-30");
		expect(miniPlayerBarLayer(false, true)).toBe("z-30");
		expect(miniPlayerBarLayer(false, false)).toBe("z-[41]");
	});

	it("keeps Like out of the miniplayer while retaining it in the expanded player", () => {
		expect(playerBar).not.toContain("PlayerLikeButton");
		expect(expandedPlayer).toContain("PlayerLikeButton");
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

	it("opens Read & Listen in the reader instead of a player side panel", () => {
		expect(miniPlayer).toContain("navigateToReadListenReader");
		expect(miniPlayer).toContain("useReadListenReaderPrefetch");
		expect(miniPlayer).toContain("readerPrefetch.prepare();");
		expect(miniPlayer).not.toContain('setSidePanel("read-listen")');
		expect(expandedPlayer).not.toContain("PlayerReadListenPanel");
		expect(expandedPlayer).not.toContain("PlayerModeSelector");
	});

	it("isolates the persistent player from the reader writing mode", () => {
		expect([...miniPlayer.matchAll(/writing-horizontal-tb/g)]).toHaveLength(2);
	});

	it("keeps reader metadata and transport controls visible on narrow screens", () => {
		expect(readListenRuntime).toContain("readerTheme: theme");
		expect(miniPlayer).toContain('"--sidebar": readerTheme.backgroundColor');
		expect(playerBar).toContain(
			'"pointer-events-none relative flex min-w-0 flex-1 items-center gap-2.5"',
		);
		expect(playerBar).not.toMatch(/className=\{\s*readListen\s*\?\s*"hidden"/);
		expect(playerBar).toContain('compactControlClass = "max-[30rem]:size-10"');
		expect(playerBar).toContain(
			"<PlayerTransport alwaysShowChapterControls />",
		);
		expect(playerBar).toContain(
			"alwaysShowChapterControls={Boolean(readListen)}",
		);
		expect(playerTransport).toContain(
			"alwaysShowChapterControls || chapterCount > 0",
		);
		expect(playerBar).not.toContain("<ReadListenModeControls");
	});

	it("keeps the return-to-narration action inside the mobile player", () => {
		expect(readListenRuntime).not.toContain(
			"fixed inset-x-0 bottom-[calc(var(--reader-player-reserve-mobile)+0.75rem)]",
		);
		expect(playerBar).toContain("!readListen.followText");
		expect(playerBar).toContain("<ReadListenFollowButton");
	});

	it("paints both player docks on the chrome surface, never on a card", () => {
		// The bar spans the full window under the rail, so it is part of the
		// frame around the content sheet — a card step would open that frame at
		// the bottom edge. Sidebar tokens also follow the reader theme override.
		expect(playerBar).toContain("border-sidebar-border border-t bg-sidebar");
		expect(playerBar).not.toContain("bg-card");
		expect(miniPlayer).not.toContain("after:bg-card");
	});

	it("keeps the reader scrollbar usable while the dock paints full-bleed", () => {
		expect(miniPlayer).toContain("fixed inset-x-0");
		expect(miniPlayer).toContain('placement === "reader"');
		expect(miniPlayer).toContain("after:left-full after:w-8 after:bg-sidebar");
		expect(miniPlayer).not.toContain("w-screen");
		expect(readerRoute).not.toContain("playerDockVisible");
	});

	it("keeps dashboard scrolling above the fixed bottom chrome", () => {
		const workspaceStart = dashboardLayout.indexOf(
			'data-slot="dashboard-workspace"',
		);
		const reserve = dashboardLayout.indexOf(
			'data-slot="dashboard-bottom-chrome-reserve"',
		);
		const mobileNav = dashboardLayout.indexOf("<MobileBottomNav");

		expect(workspaceStart).toBeGreaterThan(-1);
		expect(reserve).toBeGreaterThan(workspaceStart);
		expect(mobileNav).toBeGreaterThan(reserve);
		expect(dashboardLayout).toContain(
			"h-[calc(var(--mobile-tabbar-height)+var(--mobile-player-offset)+var(--safe-area-bottom))] shrink-0 bg-sidebar md:h-[var(--desktop-player-offset)]",
		);
		expect(dashboardLayout).not.toContain(
			"pb-[calc(var(--mobile-tabbar-height)+var(--mobile-player-offset)+var(--safe-area-bottom))]",
		);
	});

	it("keeps the read & listen controls free of transport buttons", () => {
		expect(readListenPlayer).toContain(
			"export function ReadListenModeControls",
		);
		expect(readListenPlayer).not.toContain("<SkipBack");
		expect(readListenPlayer).not.toContain("<SkipForward");
		expect(readListenPlayer).not.toContain("ReadListenSentenceControls");
		expect(playerBar).not.toContain("<ReadListenSentenceControls");
		expect(expandedPlayer).not.toContain("<ReadListenSentenceControls");
	});

	it("keeps desktop playback centered and mobile transport compact", () => {
		expect(playerBar).toContain('readListen ? "w-[42%]" : "w-1/2"');
		expect(playerBar).toContain(
			'<div className="relative flex shrink-0 items-center justify-center">',
		);
		expect(playerBar).toContain(
			'<div className="flex max-w-full items-center justify-center">',
		);
	});

	it("keeps the persistent dock above the shared reader transition", () => {
		expect(miniPlayer).toMatch(/read-listen-player-dock[^"\n]*\bfixed\b/);
		expect(miniPlayer).toContain("data-player-expanded={isExpanded}");
		expect(miniPlayer).toContain("transitionReadListenNavigation");
		expect(css).toContain(
			'.read-listen-player-dock[data-player-expanded="false"]',
		);
		expect(css).toContain("view-transition-name: read-listen-player");
		expect(css).toContain("::view-transition-group(read-listen-player)");
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
