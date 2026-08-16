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
