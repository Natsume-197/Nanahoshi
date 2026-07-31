import { describe, expect, mock, test } from "bun:test";
import type { Queue } from "bullmq";
import { waitForQueueCapacity } from "../backpressure";

const config = { highWatermark: 1000, lowWatermark: 500, pollMs: 25 };

function queueWithDepths(depths: number[]) {
	let index = 0;
	return {
		getJobCountByTypes: mock(() =>
			Promise.resolve(depths[Math.min(index++, depths.length - 1)] ?? 0),
		),
	} as unknown as Pick<Queue, "getJobCountByTypes">;
}

describe("scan queue backpressure", () => {
	test("continues immediately when the incoming batch fits", async () => {
		const queue = queueWithDepths([700]);
		const sleep = mock(() => Promise.resolve());
		expect(await waitForQueueCapacity(queue, 250, config, { sleep })).toEqual({
			pending: 700,
			throttled: false,
		});
		expect(sleep).not.toHaveBeenCalled();
	});

	test("drains to the low watermark after crossing the high watermark", async () => {
		const queue = queueWithDepths([900, 800, 500]);
		const sleep = mock(() => Promise.resolve());
		const checkCancelled = mock(() => Promise.resolve());
		expect(
			await waitForQueueCapacity(queue, 250, config, {
				sleep,
				checkCancelled,
			}),
		).toEqual({ pending: 500, throttled: true });
		expect(sleep).toHaveBeenCalledTimes(2);
		expect(checkCancelled).toHaveBeenCalledTimes(3);
	});

	test("propagates cancellation instead of waiting forever", async () => {
		const queue = queueWithDepths([1000]);
		const error = new Error("cancelled");
		const checkCancelled = mock(() => Promise.reject(error));
		await expect(
			waitForQueueCapacity(queue, 1, config, { checkCancelled }),
		).rejects.toBe(error);
	});

	test("rejects empty batches", async () => {
		await expect(
			waitForQueueCapacity(queueWithDepths([0]), 0, config),
		).rejects.toThrow("positive integer");
	});
});
