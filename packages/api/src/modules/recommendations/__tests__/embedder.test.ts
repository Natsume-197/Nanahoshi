import { describe, expect, it } from "bun:test";
import { computeOnnxThreads } from "../embedder";

describe("computeOnnxThreads", () => {
	it("leaves two cores for the event loop on a multi-core box", () => {
		expect(computeOnnxThreads(8, 8)).toBe(6);
		expect(computeOnnxThreads(4, 8)).toBe(2);
	});

	it("never exceeds the dynamic worker CPU budget", () => {
		expect(computeOnnxThreads(16, 2)).toBe(2);
	});

	it("never drops below one thread on small boxes", () => {
		expect(computeOnnxThreads(2, 8)).toBe(1);
		expect(computeOnnxThreads(1, 8)).toBe(1);
	});
});
