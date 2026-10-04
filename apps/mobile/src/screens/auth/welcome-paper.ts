/** One ground for the whole screen: white by day, ink by night. */
export const PAPER = {
	light: {
		paper: "#ffffff",
		ink: "#1e1e20",
		inkSoft: "#6b6b70",
		tint: "#f1f0f2",
		lift: "0 -10px 28px rgba(0, 0, 0, 0.16), 0 -1px 3px rgba(0, 0, 0, 0.08)",
		offline: "#d97706",
		mockLine: "#e3e1e5",
		mockMark: "#fbe5a0",
		fill: "#1e1e20",
		onFill: "#ffffff",
	},
	dark: {
		paper: "#1d1b1d",
		ink: "#f1ece3",
		inkSoft: "#a49e95",
		tint: "#2c292b",
		// Dark grounds swallow shadow: a faint lit rim marks the edge instead.
		lift: "0 -12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.07)",
		offline: "#f59e0b",
		mockLine: "#3d393b",
		mockMark: "#6b5523",
		fill: "#f1ece3",
		onFill: "#1d1b1d",
	},
};
export type Paper = typeof PAPER.light;

/** Both welcome pages share one left edge and one rhythm. */
export const GUTTER = 28;
/** The gap between a page's blocks: text, buttons, the legal line. */
export const SECTION_GAP = 32;
/** Space under the last block, above the system bar. */
export const FOOT_INSET = 36;
