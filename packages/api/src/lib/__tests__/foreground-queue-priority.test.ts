import { describe, expect, mock, test } from "bun:test";
import { createForegroundQueuePriorityController } from "../foreground-queue-priority";

describe("foreground queue priority", () => {
	test("pauses cover work while file events are active or queued", async () => {
		const pause = mock(() => Promise.resolve());
		const resume = mock(() => {});
		const controller = createForegroundQueuePriorityController({
			backgroundWorker: { pause, resume },
			readForegroundCounts: async () => ({
				active: 3,
				waiting: 350,
				prioritized: 0,
			}),
		});

		expect(await controller.sample()).toBe("yielded");
		expect(pause).toHaveBeenCalledWith(true);
		expect(resume).not.toHaveBeenCalled();
	});

	test("resumes cover work once the file-event queue drains", async () => {
		const loads = [
			{ active: 1, waiting: 10, prioritized: 0 },
			{ active: 0, waiting: 0, prioritized: 0 },
		];
		const pause = mock(() => Promise.resolve());
		const resume = mock(() => {});
		const controller = createForegroundQueuePriorityController({
			backgroundWorker: { pause, resume },
			readForegroundCounts: async () => loads.shift() ?? {},
		});

		await controller.sample();
		expect(await controller.sample()).toBe("resumed");
		expect(resume).toHaveBeenCalledTimes(1);
	});

	test("fails open when queue load cannot be read", async () => {
		const pause = mock(() => Promise.resolve());
		const controller = createForegroundQueuePriorityController({
			backgroundWorker: { pause, resume: mock(() => {}) },
			readForegroundCounts: async () => {
				throw new Error("Redis unavailable");
			},
		});

		expect(await controller.sample()).toBe("load_error");
		expect(pause).not.toHaveBeenCalled();
	});
});
