import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
	new URL("./expanded-player.tsx", import.meta.url),
	"utf8",
);
const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

describe("expanded player ambient background", () => {
	it("derives the complete low-chroma Now Brief field from the main color", () => {
		expect(source).toContain('"--player-source"');
		expect(source).toContain('"--player-source": audiobook.mainColor');
		expect(source).toContain('className="player-ambient-field');
		expect(source).toContain('className="player-ambient-orbs"');
		expect(source).not.toContain("getMutedAccentSurfaceColor");
		expect(source).not.toContain("TINT_GRADIENT");
		expect(source).not.toContain("AMBIENT_COVER_WIDTH");
		expect(css).toContain(".player-ambient-field {");
		expect(css).toContain(".player-ambient-orbs {");
		expect(css).toMatch(/oklch\(\s*from var\(--player-source\)/);
		expect(css).not.toContain("calc(h + 6)");
		expect(css).not.toContain("calc(h - 6)");
		expect(css).not.toContain("calc(h + 24)");
		expect(css).not.toContain("calc(h - 32)");
		expect(css).toContain("inset: -10%");
		expect(css).toContain("0.31 calc(c * 0.18) h");
		expect(css).toContain("0.255 calc(c * 0.14) h");
		expect(css).toContain("0.22 calc(c * 0.1) h");
		expect(css).toContain("0.43 calc(c * 0.08) h");
		expect(css).toContain("0.36 calc(c * 0.18) h");
		expect(css).not.toContain("--player-edge-teal");
		expect(css).not.toContain("--player-edge-blue");
	});

	it("uses one filter-free ambient compositor layer", () => {
		expect(source).not.toContain("player-ambient-specks");
		expect(source).not.toContain("player-ambient-bloom-primary");
		expect(source).not.toContain("player-ambient-bloom-secondary");
		expect(source).not.toContain("player-ambient-bloom-accent");
		expect(css).not.toContain("filter: blur(clamp(4rem");
		expect(css).toContain("@keyframes player-ambient-drift");
		expect(css).toContain("player-ambient-drift 42s");
		expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
	});

	it("keeps a dark contrast veil above the artwork", () => {
		expect(source).toContain('className="player-ambient-veil"');
		expect(css).toContain(".player-ambient-veil {");
		expect(css).toContain("transparent 62%");
	});

	it("falls back to the solid tinted scene when transparency is reduced", () => {
		expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
		expect(css).toContain(".player-ambient-orbs");
		expect(css).toContain("opacity: 0");
	});

	it("reserves header space for the mode selector instead of overlaying controls", () => {
		expect(source).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
		expect(source).toContain("max-[22rem]:row-start-2");
		expect(source).not.toContain("absolute left-1/2 -translate-x-1/2");
	});
});
