import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
	new URL("./expanded-player.tsx", import.meta.url),
	"utf8",
);
const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

describe("expanded player ambient background", () => {
	it("builds multi-hue ambient light over a main-color dark scene", () => {
		expect(source).toContain('"--player-source"');
		expect(source).toContain('"--player-source": audiobook.mainColor');
		expect(source).toContain(
			'"oklch(from var(--player-source) 0.18 calc(c * 0.2) h)"',
		);
		expect(source).toContain('className="player-ambient-field');
		expect(source).toContain('className="player-ambient-orbs"');
		expect(source).not.toContain("getMutedAccentSurfaceColor");
		expect(source).not.toContain("TINT_GRADIENT");
		expect(source).not.toContain("AMBIENT_COVER_WIDTH");
		expect(css).toContain(".player-ambient-field {");
		expect(css).toContain(".player-ambient-orbs {");
		expect(css).toContain(
			"--player-night-mid: oklch(from var(--player-source) 0.18 calc(c * 0.2) h)",
		);
		expect(css).not.toContain("--player-night-mid: #181321");
		expect(css).toContain("--player-glow-violet");
		expect(css).toContain("--player-glow-rose");
		expect(css).toContain("--player-glow-blue");
		expect(css).toContain("--player-glow-cover");
		expect(css).toMatch(/oklch\(\s*from var\(--player-source\)/);
		expect(css).toContain("inset: -24%");
		expect(css).toContain("ellipse 62% 72% at 66% 34%");
		expect(css).toContain("ellipse 78% 56% at 52% 108%");
		expect(css).toContain("ellipse 54% 68% at 108% 48%");
		expect(css).toContain("ellipse 58% 72% at 14% 36%");
	});

	it("uses large gradient blobs instead of blurring the cover", () => {
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
		expect(css).toContain("transparent 30%");
		expect(css).toContain(
			"oklch(from var(--player-source) 0.055 calc(c * 0.07) h / 7%) 64%",
		);
		expect(css).toContain(
			"oklch(from var(--player-source) 0.04 calc(c * 0.05) h / 34%) 100%",
		);
		expect(css).toContain("transparent 64%");
	});

	it("falls back to the solid tinted scene when transparency is reduced", () => {
		expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
		expect(css).toContain(".player-ambient-orbs");
		expect(css).toContain("opacity: 0");
	});

	it("keeps a balanced single-row header without the mode selector", () => {
		expect(source).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
		expect(source).not.toContain("PlayerModeSelector");
		expect(source).not.toContain("max-[22rem]:row-start-2");
		expect(source).not.toContain("absolute left-1/2 -translate-x-1/2");
	});

	it("lets the artwork yield before lower player controls are clipped", () => {
		expect(source).toContain(
			'"flex min-h-0 w-full flex-1 items-center justify-center"',
		);
		expect(source).not.toContain("min-h-[min(52vw,18rem)]");
		expect(source).toContain("gap-3 md:max-w-lg md:gap-4");
	});

	it("keeps the artwork size stable across playback states", () => {
		expect(source).not.toContain('!isPlaying && "scale-[0.94]"');
		expect(source).not.toContain("transition-transform duration-500");
	});

	it("allows the artwork to use more space than the text column", () => {
		expect(source).toContain("max-w-[calc(100%+1rem)]");
		expect(source).not.toContain("xl:h-full xl:w-auto xl:max-w-full");
	});

	it("keeps the cover free of a background frame", () => {
		expect(source).not.toContain("outline-[var(--image-outline)]");
		expect(source).not.toContain("xl:h-full xl:w-auto xl:max-w-full");
	});
});
