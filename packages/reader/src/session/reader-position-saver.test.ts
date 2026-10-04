import { describe, expect, test } from "bun:test";
import {
	createReaderPositionSaver,
	type ReaderPositionSaveScheduler,
} from "./reader-session";

function fakeScheduler() {
	let nextId = 0;
	const callbacks = new Map<number, () => void>();
	const scheduler: ReaderPositionSaveScheduler = {
		schedule: (callback) => {
			const id = ++nextId;
			callbacks.set(id, callback);
			return id;
		},
		cancel: (id) => callbacks.delete(id as number),
	};
	return {
		scheduler,
		runAll: () => {
			for (const callback of [...callbacks.values()]) callback();
			callbacks.clear();
		},
	};
}

describe("reader position saver", () => {
	test("saves only the final measured position in a scroll burst", () => {
		const fake = fakeScheduler();
		let position = 10;
		const saved: number[] = [];
		const saver = createReaderPositionSaver({
			read: () => ({ exploredCharCount: position }),
			write: (next) => saved.push(next.exploredCharCount),
			scheduler: fake.scheduler,
		});

		saver.schedule();
		position = 40;
		saver.schedule();
		fake.runAll();

		expect(saved).toEqual([40]);
	});

	test("flushes the latest position before the page becomes unavailable", () => {
		const fake = fakeScheduler();
		const saved: number[] = [];
		const saver = createReaderPositionSaver({
			read: () => ({ exploredCharCount: 24 }),
			write: (next) => saved.push(next.exploredCharCount),
			scheduler: fake.scheduler,
		});

		saver.schedule();
		saver.flush();
		fake.runAll();

		expect(saved).toEqual([24]);
	});
});
