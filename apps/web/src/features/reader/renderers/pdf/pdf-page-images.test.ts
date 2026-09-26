import { describe, expect, test } from "bun:test";
import {
	type PdfPageImage,
	PdfPageImageStore,
	type PdfRenderLane,
} from "./pdf-page-images";

const PREVIEW = 0.5;

class FakeImage implements PdfPageImage {
	closed = false;
	constructor(
		readonly pageIndex: number,
		readonly scale: number,
		readonly width = 100,
		readonly height = 100,
	) {}
	close() {
		this.closed = true;
	}
}

/** A lane whose renders finish only when the test says so. */
class ManualLane implements PdfRenderLane<FakeImage> {
	readonly jobs: {
		pageIndex: number;
		scale: number;
		finish: (size?: number) => Promise<void>;
	}[] = [];

	render(pageIndex: number, scale: number) {
		return new Promise<FakeImage>((resolve) => {
			this.jobs.push({
				pageIndex,
				scale,
				finish: async (size = 100) => {
					resolve(new FakeImage(pageIndex, scale, size, size));
					await Promise.resolve();
					await Promise.resolve();
				},
			});
		});
	}

	get started() {
		return this.jobs.map(
			(job) =>
				`${job.pageIndex}@${job.scale === PREVIEW ? "preview" : job.scale}`,
		);
	}
}

function createStore(budgets: { full?: number; preview?: number } = {}) {
	return new PdfPageImageStore<FakeImage>({
		previewScale: () => PREVIEW,
		fullBudgetBytes: budgets.full,
		previewBudgetBytes: budgets.preview,
	});
}

describe("PdfPageImageStore", () => {
	test("a page scrolled into view shows a quick preview before the sharp render", async () => {
		const store = createStore();
		const lane = new ManualLane();
		store.request(3, 2);
		store.setVisible(3, true);
		store.addLane(lane);

		expect(lane.started).toEqual(["3@preview"]);
		await lane.jobs[0]?.finish();
		expect(store.best(3)?.scale).toBe(PREVIEW);

		expect(lane.started).toEqual(["3@preview", "3@2"]);
		await lane.jobs[1]?.finish();
		expect(store.best(3)?.scale).toBe(2);
	});

	test("with two lanes the preview and the sharp render run side by side", () => {
		const store = createStore();
		const first = new ManualLane();
		const second = new ManualLane();
		store.request(0, 2);
		store.setVisible(0, true);
		store.addLane(first);
		store.addLane(second);

		expect([...first.started, ...second.started].sort()).toEqual([
			"0@2",
			"0@preview",
		]);
	});

	test("visible pages jump the queue, then neighbours render nearest first", async () => {
		const store = createStore();
		const lane = new ManualLane();
		for (const page of [10, 11, 12, 13, 14]) store.request(page, 2);
		store.setVisible(11, true);
		store.addLane(lane);

		await lane.jobs[0]?.finish(); // preview of 11
		await lane.jobs[1]?.finish(); // sharp 11
		await lane.jobs[2]?.finish();
		await lane.jobs[3]?.finish();
		await lane.jobs[4]?.finish();

		expect(lane.started.slice(0, 2)).toEqual(["11@preview", "11@2"]);
		expect(lane.started.slice(2, 4).sort()).toEqual(["10@2", "12@2"]);
		expect(lane.started[4]).toBe("13@2");
	});

	test("while held, pages wait so the resume page renders before page 1", () => {
		const store = createStore();
		const lane = new ManualLane();
		store.addLane(lane);
		const release = store.hold();
		const leavePageOne = store.request(0, 2);
		expect(lane.jobs).toHaveLength(0);

		leavePageOne();
		store.request(266, 2);
		release();

		expect(lane.started).toEqual(["266@2"]);
	});

	test("pages the reader scrolls back to come from cache without rendering", async () => {
		const store = createStore();
		const lane = new ManualLane();
		store.addLane(lane);
		const release = store.request(5, 2);
		await lane.jobs[0]?.finish();
		release();

		store.request(5, 2);
		store.setVisible(5, true);

		expect(lane.jobs).toHaveLength(1);
		expect(store.best(5)?.scale).toBe(2);
	});

	test("zooming keeps the old image on screen until the new scale is ready", async () => {
		const store = createStore();
		const lane = new ManualLane();
		store.addLane(lane);
		const release = store.request(0, 1);
		await lane.jobs[0]?.finish();
		const old = store.best(0);
		release();
		store.request(0, 3);

		expect(store.best(0)).toBe(old);
		await lane.jobs[1]?.finish();
		expect(store.best(0)?.scale).toBe(3);
		expect(old?.closed).toBe(true);
	});

	test("over budget, off-screen pages are evicted oldest first and mounted pages never", async () => {
		// Each fake full render costs 100×100×4 bytes; the budget fits two.
		const store = createStore({ full: 2 * 40_000 });
		const lane = new ManualLane();
		store.addLane(lane);
		const releases = [0, 1, 2].map((page) => store.request(page, 2));
		await lane.jobs[0]?.finish();
		await lane.jobs[1]?.finish();
		await lane.jobs[2]?.finish();

		expect([0, 1, 2].map((page) => store.best(page)?.scale)).toEqual([2, 2, 2]);
		releases[0]?.();
		releases[1]?.();

		expect(store.best(0)).toBeUndefined();
		expect(store.best(1)?.scale).toBe(2);
		expect(store.best(2)?.scale).toBe(2);
	});

	test("a retired lane hands its unfinished page to another lane", () => {
		const store = createStore();
		const dying = new ManualLane();
		const retire = store.addLane(dying);
		store.request(4, 2);
		expect(dying.started).toEqual(["4@2"]);

		retire();
		const replacement = new ManualLane();
		store.addLane(replacement);

		expect(replacement.started).toEqual(["4@2"]);
	});

	test("clearing drops renders that finish afterwards", async () => {
		const store = createStore();
		const lane = new ManualLane();
		store.addLane(lane);
		store.request(0, 2);
		store.clear();
		await lane.jobs[0]?.finish();

		expect(store.best(0)).toBeUndefined();
	});
});
