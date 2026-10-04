import { describe, expect, test } from "bun:test";
import {
	createReaderLayoutScheduler,
	type ReaderLayoutSchedulerClock,
} from "./reader-layout";

function fakeClock() {
	let nextId = 0;
	const callbacks = new Map<number, () => void>();
	const clock: ReaderLayoutSchedulerClock = {
		schedule: (callback) => {
			const id = ++nextId;
			callbacks.set(id, callback);
			return id;
		},
		cancel: (id) => callbacks.delete(id as number),
	};
	return {
		clock,
		runAll: () => {
			for (const callback of [...callbacks.values()]) callback();
			callbacks.clear();
		},
	};
}

describe("reader layout scheduler", () => {
	test("applies settings in the next paint frame without a timer hop", () => {
		const original = Object.getOwnPropertyDescriptor(
			globalThis,
			"requestAnimationFrame",
		);
		let frame: FrameRequestCallback | undefined;
		let runs = 0;
		Object.defineProperty(globalThis, "requestAnimationFrame", {
			configurable: true,
			value: (callback: FrameRequestCallback) => {
				frame = callback;
				return 1;
			},
		});
		const scheduler = createReaderLayoutScheduler({
			run: () => {
				runs += 1;
			},
		});
		try {
			scheduler.request();
			expect(runs).toBe(0);
			expect(frame).toBeDefined();
			frame?.(16);
			expect(runs).toBe(1);
		} finally {
			scheduler.cancel();
			if (original)
				Object.defineProperty(globalThis, "requestAnimationFrame", original);
			else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
		}
	});

	test("coalesces a burst into the final transaction", () => {
		const fake = fakeClock();
		const runs: boolean[] = [];
		const scheduler = createReaderLayoutScheduler({
			clock: fake.clock,
			run: (transaction) => runs.push(transaction.isCurrent()),
		});

		scheduler.request();
		scheduler.request();
		fake.runAll();

		expect(runs).toEqual([true]);
	});

	test("marks already-started async work stale when a newer layout arrives", () => {
		const fake = fakeClock();
		let transaction: { isCurrent(): boolean } | undefined;
		const scheduler = createReaderLayoutScheduler({
			clock: fake.clock,
			run: (next) => {
				transaction = next;
			},
		});

		scheduler.request();
		fake.runAll();
		expect(transaction?.isCurrent()).toBe(true);

		scheduler.request();
		expect(transaction?.isCurrent()).toBe(false);
	});

	test("cancels pending and started work on disposal", () => {
		const fake = fakeClock();
		let runCount = 0;
		const scheduler = createReaderLayoutScheduler({
			clock: fake.clock,
			run: () => {
				runCount += 1;
			},
		});

		scheduler.request();
		scheduler.cancel();
		fake.runAll();

		expect(runCount).toBe(0);
	});
});
