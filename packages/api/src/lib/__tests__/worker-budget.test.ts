import { describe, expect, test } from "bun:test";
import {
	clampToWorkerBudget,
	scanHashConcurrency,
	scanStatConcurrency,
} from "../worker-budget";

describe("worker resource budget", () => {
	test("caps requested concurrency and never drops below one", () => {
		expect(clampToWorkerBudget(20, 2)).toBe(2);
		expect(clampToWorkerBudget(1, 8)).toBe(1);
		expect(clampToWorkerBudget(0, 0)).toBe(1);
	});

	test("derives bounded scan I/O concurrency", () => {
		expect(scanStatConcurrency(2)).toBe(32);
		expect(scanHashConcurrency(2)).toBe(8);
		expect(scanStatConcurrency(1)).toBe(16);
		expect(scanHashConcurrency(1)).toBe(4);
	});
});
