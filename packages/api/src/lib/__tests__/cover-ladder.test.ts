import { describe, expect, test } from "bun:test";
import {
	COVER_STORE_MAX_DIM,
	coverLadder,
	DEFERRED_WARM_WIDTHS,
	masterWidthFromFilename,
	snapDim,
	snapQuality,
	WARM_QUALITY,
	WARM_WIDTHS,
} from "../cover-ladder";

describe("snapDim", () => {
	test("snaps up to the next allowed bucket", () => {
		expect(snapDim(150)).toBe(200);
		expect(snapDim(200)).toBe(200);
		expect(snapDim(201)).toBe(300);
	});

	test("clamps above the ladder and rejects non-sizes", () => {
		expect(snapDim(9999)).toBe(2048);
		expect(snapDim(0)).toBe(0);
		expect(snapDim(-5)).toBe(0);
		expect(snapDim(Number.NaN)).toBe(0);
	});
});

describe("snapQuality", () => {
	test("snaps up, and clamps above the top bucket", () => {
		expect(snapQuality(80)).toBe(86);
		expect(snapQuality(95)).toBe(95);
		expect(snapQuality(100)).toBe(95);
	});

	test("defaults to 60 when absent", () => {
		expect(snapQuality(Number.NaN)).toBe(60);
	});
});

describe("masterWidthFromFilename", () => {
	test("reads the width ingest wrote into the name", () => {
		expect(masterWidthFromFilename("abc-uuid_w1350.jpg")).toBe(1350);
		expect(masterWidthFromFilename("abc-uuid_w600.avif")).toBe(600);
	});

	test("is null for anything that has not been ingested", () => {
		expect(masterWidthFromFilename("abc-uuid.jpg")).toBeNull();
		expect(masterWidthFromFilename(null)).toBeNull();
		expect(masterWidthFromFilename(undefined)).toBeNull();
		// A marker without an extension is not a master filename.
		expect(masterWidthFromFilename("abc_w1350")).toBeNull();
	});

	test("does not mistake other underscore segments for a width", () => {
		expect(masterWidthFromFilename("abc_width.jpg")).toBeNull();
		expect(masterWidthFromFilename("abc_w.jpg")).toBeNull();
	});
});

describe("coverLadder", () => {
	const widths = [200, 300, 400, 600, 800, 1200];

	test("keeps every rung when the master resolution is unknown", () => {
		expect(coverLadder(widths, null)).toEqual(widths);
	});

	test("drops rungs the master cannot fill", () => {
		// The serve route would answer 800w and 1200w with the same 600px bytes.
		expect(coverLadder(widths, 600)).toEqual([200, 300, 400, 600]);
	});

	test("makes an off-rung master its own honest top rung", () => {
		expect(coverLadder(widths, 1000)).toEqual([200, 300, 400, 600, 800, 1000]);
	});

	test("skips a top rung that would duplicate the one below it", () => {
		// 610 and 600 snap into the same cache bucket: a second near-identical
		// encode for no visible detail.
		expect(coverLadder(widths, 610)).toEqual([200, 300, 400, 600]);
	});

	test("a master below every rung is the only candidate", () => {
		expect(coverLadder(widths, 150)).toEqual([150]);
	});

	test("never advertises more pixels than the master holds", () => {
		for (const master of [120, 250, 512, 601, 999, 1600, 4000]) {
			for (const width of coverLadder(widths, master)) {
				expect(width).toBeLessThanOrEqual(Math.max(master, widths.at(-1) ?? 0));
				if (master < (widths.at(-1) ?? 0))
					expect(width).toBeLessThanOrEqual(master);
			}
		}
	});
});

describe("warm rungs", () => {
	test("survive the serve route's snapping unchanged", () => {
		for (const w of WARM_WIDTHS) expect(snapDim(w)).toBe(w);
		expect(snapQuality(WARM_QUALITY)).toBe(WARM_QUALITY);
	});

	test("puts the actively used card widths ahead of the deferred retina rung", () => {
		expect(WARM_WIDTHS).toEqual([128, 200, 300, 400]);
		expect(DEFERRED_WARM_WIDTHS).toEqual([600]);
	});
});

describe("COVER_STORE_MAX_DIM", () => {
	test("leaves a portrait cover wide enough for the widest rung a page asks for", () => {
		// The ceiling bounds the long edge, and covers are portrait — so it is the
		// height that gets clamped while the layout requests width. At 2:3 a 1600
		// ceiling silently cost 63% of the library its 1200w rung.
		const widestRung = 1200;
		const portraitWidth = Math.round(COVER_STORE_MAX_DIM * (2 / 3));

		expect(portraitWidth).toBeGreaterThanOrEqual(widestRung);
	});
});
