import { describe, expect, it } from "bun:test";
import { planSeek } from "../seek-plan";

// readyState values: 0 HAVE_NOTHING, 1 HAVE_METADATA, 4 HAVE_ENOUGH_DATA.
const singleFile = {
	offsets: [0],
	totalDuration: 0,
	fileCount: 1,
	currentFileIndex: 0,
	readyState: 4,
	mediaDuration: 3600,
	bookDuration: 3600,
};

// Three files of 100s / 200s / 300s.
const multiFile = {
	offsets: [0, 100, 300],
	totalDuration: 600,
	fileCount: 3,
	currentFileIndex: 0,
	readyState: 4,
	mediaDuration: 100,
	bookDuration: 600,
};

describe("planSeek — single file", () => {
	it("seeks directly on loaded media", () => {
		expect(planSeek({ ...singleFile, time: 1200 })).toEqual({
			fileIndex: 0,
			fileTime: 1200,
			srcSwap: false,
			deferred: false,
		});
	});

	it("clamps to media duration and to zero", () => {
		expect(planSeek({ ...singleFile, time: 9999 }).fileTime).toBe(3600);
		expect(planSeek({ ...singleFile, time: -5 }).fileTime).toBe(0);
	});

	it("falls back to book duration when media duration is NaN", () => {
		const plan = planSeek({
			...singleFile,
			time: 9999,
			mediaDuration: Number.NaN,
		});
		expect(plan.fileTime).toBe(3600);
	});

	it("does not clamp to zero when no duration is known yet", () => {
		const plan = planSeek({
			...singleFile,
			time: 1200,
			mediaDuration: Number.NaN,
			bookDuration: null,
		});
		expect(plan.fileTime).toBe(1200);
	});

	it("defers the seek while metadata has not loaded", () => {
		expect(planSeek({ ...singleFile, time: 10, readyState: 0 }).deferred).toBe(
			true,
		);
	});
});

describe("planSeek — multi-file", () => {
	it("resolves the file containing the global time", () => {
		expect(planSeek({ ...multiFile, time: 50 })).toMatchObject({
			fileIndex: 0,
			fileTime: 50,
			srcSwap: false,
		});
		expect(planSeek({ ...multiFile, time: 250 })).toMatchObject({
			fileIndex: 1,
			fileTime: 150,
			srcSwap: true,
		});
		expect(planSeek({ ...multiFile, time: 550 })).toMatchObject({
			fileIndex: 2,
			fileTime: 250,
			srcSwap: true,
		});
	});

	it("lands exactly on a file boundary in the later file", () => {
		expect(planSeek({ ...multiFile, time: 100 })).toMatchObject({
			fileIndex: 1,
			fileTime: 0,
		});
	});

	it("clamps to the total duration", () => {
		expect(planSeek({ ...multiFile, time: 9999 })).toMatchObject({
			fileIndex: 2,
			fileTime: 300,
		});
	});

	it("defers when the seek crosses into another file (fresh src)", () => {
		expect(planSeek({ ...multiFile, time: 250 }).deferred).toBe(true);
	});

	it("seeks directly within the current file on loaded media", () => {
		const plan = planSeek({ ...multiFile, time: 150, currentFileIndex: 1 });
		expect(plan).toEqual({
			fileIndex: 1,
			fileTime: 50,
			srcSwap: false,
			deferred: false,
		});
	});

	it("defers a within-file seek while metadata has not loaded", () => {
		const plan = planSeek({
			...multiFile,
			time: 150,
			currentFileIndex: 1,
			readyState: 0,
		});
		expect(plan.deferred).toBe(true);
		expect(plan.srcSwap).toBe(false);
	});
});
