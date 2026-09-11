import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import type { Task } from "@nanahoshi-v2/api/modules/taskManager";

process.env.VITE_SERVER_URL ||= "http://localhost:3000";
const { updateTasksInCache } = await import("./use-task-events");
const { queryClient, orpc } = await import("@/utils/orpc");
const invalidate = spyOn(queryClient, "invalidateQueries").mockResolvedValue();
afterEach(() => invalidate.mockClear());
afterAll(() => invalidate.mockRestore());

function task(
	id: number,
	type: string,
	status: Task["status"] = "completed",
): Task {
	return {
		id: String(id),
		type,
		status,
		label: "Fixture",
		serverId: "server",
		userId: "user",
		libraryId: null,
		totalJobs: 1,
		plannedJobs: 1,
		completedJobs: 1,
		failedJobs: 0,
		createdAt: 1,
		finishedAt: 2,
		sealed: true,
	};
}

test("one content completion burst invalidates the catalog only once", () => {
	updateTasksInCache(
		Array.from({ length: 100 }, (_, id) => task(id, "library-enrich")),
	);
	expect(invalidate).toHaveBeenCalledTimes(1);
	expect(invalidate).toHaveBeenCalledWith();
});

test("targeted completions coalesce without refreshing the whole catalog", () => {
	updateTasksInCache(
		Array.from({ length: 100 }, (_, id) =>
			task(id, id % 2 ? "read-listen-generation" : "recommendations-rebuild"),
		),
	);
	expect(invalidate).toHaveBeenCalledTimes(2);
	expect(invalidate).toHaveBeenCalledWith({ queryKey: orpc.readListen.key() });
	expect(invalidate).toHaveBeenCalledWith({
		queryKey: orpc.recommendations.key(),
	});
});

test("full refresh covers targeted completions in the same burst", () => {
	updateTasksInCache([
		task(1, "recommendations-rebuild"),
		task(2, "library-scan"),
		task(3, "read-listen-generation"),
	]);
	expect(invalidate).toHaveBeenCalledTimes(1);
	expect(invalidate).toHaveBeenCalledWith();
});

test("running content stays throttled but completion refreshes immediately", () => {
	let now = Date.now() + 10_000;
	const clock = spyOn(Date, "now").mockImplementation(() => now);
	try {
		const running = Array.from({ length: 100 }, (_, id) =>
			task(id, "library-scan", "running"),
		);
		updateTasksInCache(running);
		expect(invalidate).toHaveBeenCalledTimes(3);
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: orpc.books.listRecent.key(),
		});
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: orpc.audiobooks.listRecent.key(),
		});
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: orpc.books.availableFormats.key(),
		});
		now += 1000;
		updateTasksInCache(running);
		expect(invalidate).toHaveBeenCalledTimes(3);
		updateTasksInCache([task(1, "library-scan")]);
		expect(invalidate).toHaveBeenCalledTimes(4);
		expect(invalidate).toHaveBeenLastCalledWith();
	} finally {
		clock.mockRestore();
	}
});

test("unrelated tasks and running targeted tasks do not refresh catalogs", () => {
	updateTasksInCache([
		task(1, "send-to-kindle"),
		task(2, "recommendations-rebuild", "running"),
		task(3, "read-listen-generation", "running"),
	]);
	expect(invalidate).not.toHaveBeenCalled();
});
