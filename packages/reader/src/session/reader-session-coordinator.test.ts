import { describe, expect, test } from "bun:test";
import {
	createReaderSessionCoordinator,
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

const at = (
	exploredCharCount: number,
	modifiedAt = exploredCharCount,
	offset: { scrollX?: number; scrollY?: number } = {},
) => ({
	exploredCharCount,
	progress: exploredCharCount / 100,
	modifiedAt,
	locator: { sectionReference: "chapter", characterOffset: exploredCharCount },
	...offset,
});

describe("reader session coordinator", () => {
	test("hydrates the counter and preserves active intent during loader revalidation", () => {
		const session = createReaderSessionCoordinator({ save: () => {} });

		expect(session.hydrate(at(34))).toMatchObject({ exploredCharCount: 34 });
		session.report(at(72));
		expect(session.hydrate(at(34))).toMatchObject({ exploredCharCount: 72 });
	});

	test("deduplicates a first engine report without resetting restored progress", () => {
		const session = createReaderSessionCoordinator({ save: () => {} });
		session.hydrate(at(34));

		expect(session.report(at(34))).toBe(false);
		expect(session.snapshot()).toMatchObject({ exploredCharCount: 34 });
	});

	test("retains a changed exact coordinate inside the same image", () => {
		const session = createReaderSessionCoordinator({ save: () => {} });
		session.hydrate(at(34, 1, { scrollY: 400 }));

		expect(session.report(at(34, 2, { scrollY: 720 }))).toBe(true);
		expect(session.snapshot().position).toMatchObject({
			exploredCharCount: 34,
			scrollY: 720,
		});
	});

	test("drops an exact coordinate when the next engine only reports semantics", () => {
		const session = createReaderSessionCoordinator({ save: () => {} });
		session.hydrate(at(34, 1, { scrollY: 720 }));

		expect(session.report(at(34, 2))).toBe(true);
		expect(session.snapshot().position?.exploredCharCount).toBe(34);
		expect(session.snapshot().position?.scrollY).toBeUndefined();
	});

	test("makes emitted timestamps monotonic and saves only settled intent", () => {
		const fake = fakeScheduler();
		const saved: number[] = [];
		const session = createReaderSessionCoordinator({
			save: (position) => saved.push(position.exploredCharCount),
			scheduler: fake.scheduler,
		});

		session.report(at(12, 1));
		session.report(at(48, 1));
		fake.runAll();

		expect(session.snapshot().position?.modifiedAt).toBeGreaterThan(1);
		expect(saved).toEqual([48]);
	});

	test("starts a new book without retaining the prior book's position", () => {
		const session = createReaderSessionCoordinator({ save: () => {} });
		session.hydrate(at(72));

		session.reset();

		expect(session.snapshot()).toEqual({
			position: undefined,
			exploredCharCount: 0,
		});
	});
});
