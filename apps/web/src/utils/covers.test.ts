import { describe, expect, test } from "bun:test";

// `covers.ts` resolves VITE_SERVER_URL at module load, so it has to be set
// before the dynamic import below — a static import would hoist above this.
process.env.VITE_SERVER_URL = "http://localhost:3000";
const { coverPresets, getCoverSrcSet, getCoverUrl } = await import("./covers");

/** Mirrors ALLOWED_DIMS in packages/api/src/lib/cover-cache.ts. */
const SERVER_BUCKETS = [64, 128, 200, 300, 400, 600, 800, 1200, 2048] as const;

const snapDim = (n: number) => SERVER_BUCKETS.find((d) => d >= n) ?? 2048;

const presets = Object.entries(coverPresets);

describe("cover presets", () => {
	test.each(
		presets,
	)("%s requests only widths the server serves verbatim", (_name, preset) => {
		// An off-bucket width is snapped up, so the `Nw` descriptor would
		// understate the pixels actually delivered and the browser would pick
		// against numbers that are wrong.
		for (const width of preset.widths) {
			expect(snapDim(width)).toBe(width);
		}
	});

	test.each(presets)("%s has no duplicate candidates", (_name, preset) => {
		expect(new Set(preset.widths).size).toBe(preset.widths.length);
	});

	test.each(presets)("%s ladder is ascending", (_name, preset) => {
		expect([...preset.widths].sort((a, b) => a - b)).toEqual([
			...preset.widths,
		]);
	});

	test.each(
		presets,
	)("%s defaultWidth is part of the ladder", (_name, preset) => {
		expect(preset.widths).toContain(preset.defaultWidth);
	});
});

describe("cover urls", () => {
	test("requests a quality the server accepts verbatim", () => {
		// ALLOWED_QUALITIES in the cover route; an unlisted value silently snaps.
		const allowed = [50, 60, 75, 86, 95];
		const quality = new URL(getCoverUrl("a.jpg", 400)).searchParams.get(
			"quality",
		);
		expect(allowed).toContain(Number(quality));
	});

	test("pairs each candidate with its own width descriptor", () => {
		const srcSet = getCoverSrcSet("a.jpg", [200, 400]);
		const entries = srcSet.split(", ");

		expect(entries).toHaveLength(2);
		expect(entries[0]).toContain("width=200");
		expect(entries[0].endsWith(" 200w")).toBe(true);
		expect(entries[1]).toContain("width=400");
		expect(entries[1].endsWith(" 400w")).toBe(true);
	});
});
