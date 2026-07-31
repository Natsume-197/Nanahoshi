import { describe, expect, test } from "bun:test";
import { ALLOWED_DIMS } from "@nanahoshi-v2/api/lib/cover-ladder";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "../covers";

function widthsOf(srcSet: string): number[] {
	return srcSet
		.split(", ")
		.map((c) => Number(c.split(" ").at(-1)?.replace("w", "")));
}

function requestedWidths(srcSet: string): number[] {
	return srcSet
		.split(", ")
		.map((c) =>
			Number(new URL(c.split(" ")[0] ?? "").searchParams.get("width")),
		);
}

describe("getCoverFilename", () => {
	test("takes the last path segment", () => {
		expect(getCoverFilename("data/covers/abc_w1350.jpg")).toBe("abc_w1350.jpg");
		expect(getCoverFilename(null)).toBeNull();
		expect(getCoverFilename(undefined)).toBeNull();
	});
});

describe("getCoverSrcSet", () => {
	test("every descriptor matches the width actually requested", () => {
		const srcSet = getCoverSrcSet("abc_w1350.jpg", coverPresets.detail.widths);

		expect(requestedWidths(srcSet)).toEqual(widthsOf(srcSet));
	});

	test("stops where the master's pixels stop", () => {
		// A 600px master answering a 1200w candidate would hand the browser 600px
		// under a label that says otherwise.
		const srcSet = getCoverSrcSet("abc_w600.jpg", coverPresets.detail.widths);

		expect(widthsOf(srcSet)).toEqual([300, 400, 600]);
	});

	test("emits no two candidates that resolve to the same bytes", () => {
		for (const master of [250, 600, 610, 900, 1350, 4000]) {
			const srcSet = getCoverSrcSet(
				`abc_w${master}.jpg`,
				coverPresets.card.widths,
			);
			const widths = widthsOf(srcSet);

			expect(new Set(widths).size).toBe(widths.length);
			for (const w of widths) expect(w).toBeLessThanOrEqual(master);
		}
	});

	test("keeps the full ladder for art that predates ingest", () => {
		const srcSet = getCoverSrcSet("abc.jpg", coverPresets.detail.widths);

		expect(widthsOf(srcSet)).toEqual([...coverPresets.detail.widths]);
	});
});

describe("getCoverPresetUrl", () => {
	test("does not out-request a master narrower than the 1x slot", () => {
		const url = new URL(getCoverPresetUrl("abc_w200.jpg", coverPresets.detail));

		expect(url.searchParams.get("width")).toBe("200");
	});

	test("uses the preset's own default when the master clears it", () => {
		const url = new URL(
			getCoverPresetUrl("abc_w1350.jpg", coverPresets.detail),
		);

		expect(url.searchParams.get("width")).toBe(
			String(coverPresets.detail.defaultWidth),
		);
	});
});

describe("preset widths", () => {
	test("are all server resize buckets — an off-bucket width is never served", () => {
		for (const preset of Object.values(coverPresets)) {
			for (const width of preset.widths) {
				expect(ALLOWED_DIMS).toContain(width);
			}
			expect(preset.widths).toContain(preset.defaultWidth);
		}
	});
});
