import { expect, test } from "bun:test";
import { followUploadTasks } from "./upload-followup";

const instant = () => Promise.resolve();

test("refreshes only once every upload task has finished", async () => {
	const polls: Record<string, ("running" | "completed")[]> = {
		a: ["running", "completed"],
		b: ["running", "running", "completed"],
	};
	let settledAfter = -1;
	let calls = 0;
	await followUploadTasks({
		taskIds: ["a", "b"],
		sleep: instant,
		getStatus: async (id) => {
			calls += 1;
			return polls[id]?.shift() ?? "completed";
		},
		onSettled: () => {
			settledAfter = calls;
		},
	});
	// a: 2 polls, b: 3 polls; nothing refreshed before b was done.
	expect(settledAfter).toBe(5);
});

test("a task the server forgot counts as finished", async () => {
	let settled = false;
	await followUploadTasks({
		taskIds: ["gone"],
		sleep: instant,
		getStatus: async () => null,
		onSettled: () => {
			settled = true;
		},
	});
	expect(settled).toBe(true);
});

test("a stuck worker still refreshes at the deadline", async () => {
	let clock = 0;
	let settled = false;
	await followUploadTasks({
		taskIds: ["stuck"],
		timeout: 10_000,
		interval: 2000,
		now: () => clock,
		sleep: async (ms) => {
			clock += ms;
		},
		getStatus: async () => "running",
		onSettled: () => {
			settled = true;
		},
	});
	expect(settled).toBe(true);
	expect(clock).toBe(10_000);
});
