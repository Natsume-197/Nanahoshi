import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
	configureImageConcurrency,
	coverJobConcurrency,
	imageThreadsFor,
} from "../image-concurrency";

describe("imageThreadsFor", () => {
	test("keeps the API image work small", () => {
		expect(imageThreadsFor("api", 32, 32)).toBe(2);
		expect(imageThreadsFor("api", 2, 32)).toBe(1);
	});

	test("derives worker threads from its configured budget", () => {
		expect(imageThreadsFor("worker", 8, 2)).toBe(1);
		expect(imageThreadsFor("worker", 8, 4)).toBe(2);
		expect(imageThreadsFor("worker", 1, 32)).toBe(1);
	});
});

describe("coverJobConcurrency", () => {
	test("keeps native threads times jobs within the worker budget", () => {
		for (const budget of [1, 2, 4, 8]) {
			expect(
				coverJobConcurrency(8, budget) * imageThreadsFor("worker", 8, budget),
			).toBeLessThanOrEqual(budget);
		}
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
