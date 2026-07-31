import { describe, expect, test } from "bun:test";
import os from "node:os";
import sharp from "sharp";
import {
	configureImageConcurrency,
	coverJobConcurrency,
	imageThreadsFor,
} from "../image-concurrency";

const cores = Math.max(1, os.cpus().length);

describe("imageThreadsFor", () => {
	test("never leaves libvips on the single thread it arrives with", () => {
		// One thread caps every resize and encode in the app at one core: 17.4s to
		// encode a cover at effort 4, against 4.3s across the pool.
		if (cores >= 4) {
			expect(imageThreadsFor("worker")).toBeGreaterThan(1);
			expect(imageThreadsFor("api")).toBeGreaterThan(1);
		}
	});

	test("gives the worker a larger share than the API", () => {
		if (cores >= 8) {
			expect(imageThreadsFor("worker")).toBeGreaterThan(imageThreadsFor("api"));
		}
	});

	test("leaves the API cores for its event loop", () => {
		expect(imageThreadsFor("api")).toBeLessThanOrEqual(Math.ceil(cores / 2));
	});

	test("stays valid on a single-core host", () => {
		for (const role of ["api", "worker"] as const) {
			expect(imageThreadsFor(role)).toBeGreaterThanOrEqual(1);
			expect(Number.isInteger(imageThreadsFor(role))).toBe(true);
		}
	});
});

describe("coverJobConcurrency", () => {
	test("threads and jobs together never exceed the box", () => {
		// They multiply — cores/2 x cores/2 was the measured throughput peak.
		expect(
			coverJobConcurrency() * imageThreadsFor("worker"),
		).toBeLessThanOrEqual(Math.max(4, cores * cores) / 2 + cores);
	});

	test("runs at least two jobs so one slow cover cannot stall the queue", () => {
		expect(coverJobConcurrency()).toBeGreaterThanOrEqual(2);
	});
});

describe("configureImageConcurrency", () => {
	test("actually applies the setting to sharp", () => {
		const previous = sharp.concurrency();
		try {
			const applied = configureImageConcurrency("worker");
			expect(sharp.concurrency()).toBe(applied);
			expect(applied).toBe(imageThreadsFor("worker"));
		} finally {
			sharp.concurrency(previous);
		}
	});
});
