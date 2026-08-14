import { describe, expect, it } from "bun:test";
import { transitionReadListenNavigation } from "./view-transition";

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("Read & Listen view transition", () => {
	it("keeps plain navigation as the reduced-motion path", async () => {
		let starts = 0;
		let updates = 0;
		const dataset = {} as DOMStringMap;

		await transitionReadListenNavigation({
			direction: "enter",
			prefersReducedMotion: true,
			documentObject: {
				documentElement: { dataset },
				startViewTransition: () => {
					starts += 1;
					return {
						finished: Promise.resolve(),
						updateCallbackDone: Promise.resolve(),
					};
				},
			},
			update: () => {
				updates += 1;
			},
		});

		expect(starts).toBe(0);
		expect(updates).toBe(1);
		expect(dataset.readListenNavigation).toBeUndefined();
	});

	it("labels both snapshots and cleans up after the shared transition", async () => {
		const finished = deferred<void>();
		const dataset = {} as DOMStringMap;
		let directionDuringUpdate: string | undefined;

		await transitionReadListenNavigation({
			direction: "exit",
			prefersReducedMotion: false,
			documentObject: {
				documentElement: { dataset },
				startViewTransition: (update) => {
					const updateCallbackDone = Promise.resolve(update());
					return {
						finished: finished.promise,
						updateCallbackDone,
					};
				},
			},
			update: () => {
				directionDuringUpdate = dataset.readListenNavigation;
			},
		});

		expect(directionDuringUpdate).toBe("exit");
		expect(dataset.readListenNavigation).toBe("exit");
		finished.resolve();
		await finished.promise;
		await Promise.resolve();
		expect(dataset.readListenNavigation).toBeUndefined();
	});
});
