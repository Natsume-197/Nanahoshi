import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
	new URL("./expanded-player.tsx", import.meta.url),
	"utf8",
);
const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

describe("expanded player ambient background", () => {
	it("derives several abstract blooms from the cover color", () => {
		expect(source).toContain('"--player-source"');
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
		expect(css).toContain("ellipse 82% 44%");
		expect(css).toContain("0.66 calc(c * 0.09 + 0.007) h");
	});

	it("drifts the large diffused blooms slowly when motion is allowed", () => {
		expect(source).not.toContain("player-ambient-specks");
		expect(source).toContain("player-ambient-bloom-primary");
		expect(source).toContain("player-ambient-bloom-secondary");
		expect(source).toContain("player-ambient-bloom-accent");
		expect(css).toContain("@keyframes player-bloom-drift-primary");
		expect(css).toContain("@keyframes player-bloom-drift-secondary");
		expect(css).toContain("@keyframes player-bloom-drift-accent");
		expect(css).toContain("player-bloom-drift-primary 32s");
		expect(css).toContain("player-bloom-drift-secondary 40s");
		expect(css).toContain("player-bloom-drift-accent 48s");
		expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
	});

	it("keeps a dark contrast veil above the artwork", () => {
		expect(source).toContain('className="player-ambient-veil"');
		expect(css).toContain(".player-ambient-veil {");
		expect(css).toContain("transparent 58%");
	});

	it("falls back to the solid tinted scene when transparency is reduced", () => {
		expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
		expect(css).toContain(".player-ambient-orbs");
		expect(css).toContain("opacity: 0");
	});
});
