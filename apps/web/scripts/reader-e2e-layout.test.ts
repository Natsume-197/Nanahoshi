import { describe, expect, test } from "bun:test";
import {
	assertMiniplayerTategakiLayout,
	assertZeroPaddingTategakiLayout,
	type MiniplayerTategakiLayoutSnapshot,
	type TategakiLayoutSnapshot,
} from "./reader-e2e-layout";

const fullHeightLayout: TategakiLayoutSnapshot = {
	viewport: { width: 1280, height: 900 },
	route: {
		top: 0,
		right: 1280,
		bottom: 900,
		left: 0,
		width: 1280,
		height: 900,
	},
	frame: {
		top: 0,
		right: 1280,
		bottom: 900,
		left: 0,
		width: 1280,
		height: 900,
	},
	surface: {
		top: 0,
		right: 1248,
		bottom: 900,
		left: 32,
		width: 1216,
		height: 900,
	},
	publicationInsets: {
		htmlMarginTop: 0,
		htmlMarginBottom: 0,
		htmlPaddingTop: 0,
		htmlPaddingBottom: 0,
		bodyMarginTop: 0,
		bodyMarginBottom: 0,
		bodyPaddingTop: 0,
		bodyPaddingBottom: 0,
	},
};

describe("reader E2E tategaki geometry", () => {
	test("zero vertical padding fills the available page height", () => {
		expect(() =>
			assertZeroPaddingTategakiLayout(fullHeightLayout),
		).not.toThrow();

		expect(() =>
			assertZeroPaddingTategakiLayout({
				...fullHeightLayout,
				surface: {
					...fullHeightLayout.surface,
					top: 40,
					bottom: 860,
					height: 820,
				},
			}),
		).toThrow("40px top gap");
	});

	test("the miniplayer reserve is applied exactly once", () => {
		const withPlayer: MiniplayerTategakiLayoutSnapshot = {
			...fullHeightLayout,
			route: { ...fullHeightLayout.route, bottom: 812, height: 812 },
			frame: { ...fullHeightLayout.frame, bottom: 812, height: 812 },
			surface: { ...fullHeightLayout.surface, bottom: 812, height: 812 },
			player: {
				top: 812,
				right: 1280,
				bottom: 900,
				left: 0,
				width: 1280,
				height: 88,
			},
		};

		expect(() => assertMiniplayerTategakiLayout(withPlayer)).not.toThrow();
		expect(() =>
			assertMiniplayerTategakiLayout({
				...withPlayer,
				surface: { ...withPlayer.surface, bottom: 724, height: 724 },
			}),
		).toThrow("88px bottom gap");
	});
});
