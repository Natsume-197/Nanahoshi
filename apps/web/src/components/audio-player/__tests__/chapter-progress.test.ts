import { describe, expect, it } from "bun:test";
import { getProgressReadout, realTimeAt } from "../chapter-progress";

const chapter = { startTime: 600, endTime: 1500 };

describe("getProgressReadout", () => {
	it("spans the whole book in book scope", () => {
		expect(
			getProgressReadout("book", {
				globalTime: 700,
				totalDuration: 1500,
				chapter,
			}),
		).toEqual({
			start: 0,
			end: 1500,
			elapsed: 700,
			remaining: 800,
			total: 1500,
			fraction: 700 / 1500,
		});
	});

	it("narrows to the chapter in chapter scope", () => {
		expect(
			getProgressReadout("chapter", {
				globalTime: 700,
				totalDuration: 1500,
				chapter,
			}),
		).toEqual({
			start: 600,
			end: 1500,
			elapsed: 100,
			remaining: 800,
			total: 900,
			fraction: 100 / 900,
		});
	});

	it("falls back to the book when there is no chapter", () => {
		expect(
			getProgressReadout("chapter", {
				globalTime: 700,
				totalDuration: 1500,
				chapter: undefined,
			}).total,
		).toBe(1500);
	});

	it("never reports a negative remainder past the end", () => {
		const readout = getProgressReadout("book", {
			globalTime: 1600,
			totalDuration: 1500,
			chapter: undefined,
		});
		expect(readout.remaining).toBe(0);
		expect(readout.elapsed).toBe(1500);
	});

	it("stays finite for a zero-length book", () => {
		expect(
			getProgressReadout("book", {
				globalTime: 0,
				totalDuration: 0,
				chapter: undefined,
			}).fraction,
		).toBe(0);
	});
});

describe("realTimeAt", () => {
	it("shortens a stretch by the playback rate", () => {
		expect(realTimeAt(1800, 1.5)).toBe(1200);
	});

	it("guards against a zero rate", () => {
		expect(Number.isFinite(realTimeAt(60, 0))).toBe(true);
	});
});
