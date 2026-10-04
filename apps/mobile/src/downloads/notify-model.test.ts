import { describe, expect, test } from "bun:test";
import type { DownloadJob } from "./model";
import { type Batch, EMPTY_BATCH, formatSize, stepBatch } from "./notify-model";

const job = (status: DownloadJob["status"], progress = 0): DownloadJob => ({
	kind: "book",
	serverId: "s1",
	status,
	progress,
});

function run(
	steps: Record<string, DownloadJob>[],
	{
		completed = () => true,
		manual = () => true,
	}: {
		completed?: (uuid: string) => boolean;
		manual?: (uuid: string) => boolean;
	} = {},
) {
	let batch: Batch = EMPTY_BATCH;
	const views = [];
	for (const jobs of steps) {
		const result = stepBatch(batch, jobs, { completed, manual });
		batch = result.batch;
		views.push(result.view);
	}
	return views;
}

describe("stepBatch", () => {
	test("shows the title downloading now and how many wait behind it", () => {
		const [view] = run([{ a: job("queued"), b: job("downloading", 0.4) }]);
		expect(view).toMatchObject({
			type: "progress",
			uuid: "b",
			progress: 0.4,
			queued: 1,
		});
	});

	test("a run that ends names the titles that are ready", () => {
		const views = run([
			{ a: job("downloading"), b: job("queued") },
			{ b: job("downloading") },
			{},
		]);
		expect(views.at(-1)).toEqual({
			type: "finished",
			done: ["a", "b"],
			failed: [],
			quiet: false,
		});
	});

	test("failures are kept apart", () => {
		const views = run([
			{ a: job("downloading"), b: job("queued") },
			{ a: job("failed"), b: job("downloading") },
			{ a: job("failed") },
		]);
		expect(views.at(-1)).toMatchObject({ done: ["b"], failed: ["a"] });
	});

	test("a run only smart downloads made ends quietly", () => {
		const views = run([{ a: job("downloading") }, {}], {
			manual: () => false,
		});
		expect(views.at(-1)).toMatchObject({ type: "finished", quiet: true });
	});

	test("one title asked for by hand makes the whole run speak up", () => {
		const views = run(
			[
				{ a: job("downloading") },
				{ a: job("downloading"), b: job("queued") },
				{},
			],
			{ manual: (uuid) => uuid === "b" },
		);
		expect(views.at(-1)).toMatchObject({ quiet: false });
	});

	test("cancelling everything just takes the notification away", () => {
		const views = run([{ a: job("downloading") }, {}], {
			completed: () => false,
		});
		expect(views.at(-1)).toEqual({ type: "hide" });
	});

	test("an idle queue changes nothing", () => {
		expect(run([{}])).toEqual([null]);
	});
});

test("sizes read as MB, and GB past a gigabyte", () => {
	expect(formatSize(120 * 1024 ** 2, "en")).toBe("120 MB");
	expect(formatSize(1.5 * 1024 ** 3, "es")).toBe("1,5 GB");
});
