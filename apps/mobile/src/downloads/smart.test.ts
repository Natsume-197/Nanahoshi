import { describe, expect, test } from "bun:test";
import type { DownloadReason } from "./model";
import {
	daysUntilCleared,
	FINISHED_GRACE_MS,
	keepForever,
	nextInSeries,
	planSync,
	progressFraction,
	type SmartEntry,
	smartOrigin,
	type WantedTitle,
} from "./smart";

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60_000;
const ALL = new Set(["reading", "want", "collection:c1"]);

const entry = (
	uuid: string,
	reasons: DownloadReason[] | undefined,
	extra: Partial<SmartEntry> = {},
): SmartEntry => ({ kind: "book", uuid, reasons, complete: true, ...extra });

const wanted = (uuid: string, reason: DownloadReason): WantedTitle => ({
	kind: "book",
	uuid,
	reason,
});

const plan = (
	entries: SmartEntry[],
	titles: WantedTitle[],
	options: { loaded?: Set<string>; busy?: Set<string>; now?: number } = {},
) =>
	planSync({
		entries,
		wanted: titles,
		loaded: options.loaded ?? ALL,
		busy: options.busy ?? new Set(),
		now: options.now ?? NOW,
	});

describe("planSync", () => {
	test("downloads what a shelf wants and the phone lacks", () => {
		const result = plan([], [wanted("a", { type: "reading" })]);
		expect(result.download).toEqual([
			{ kind: "book", uuid: "a", reasons: [{ type: "reading" }] },
		]);
	});

	test("a title wanted twice comes down once, with both reasons", () => {
		const result = plan(
			[],
			[
				wanted("a", { type: "want" }),
				wanted("a", { type: "collection", id: "c1", name: "Viaje" }),
			],
		);
		expect(result.download).toHaveLength(1);
		expect(result.download[0].reasons.map((r) => r.type)).toEqual([
			"want",
			"collection",
		]);
	});

	test("never touches the user's own downloads, old ones included", () => {
		const result = plan(
			[
				entry("old", undefined, { finishedAt: NOW - 30 * DAY }),
				entry("mine", [{ type: "manual" }], { finishedAt: NOW - 30 * DAY }),
			],
			[],
		);
		expect(result.remove).toEqual([]);
	});

	test("a title that left its shelf goes", () => {
		const result = plan([entry("a", [{ type: "want" }])], []);
		expect(result.remove).toEqual([{ kind: "book", uuid: "a" }]);
	});

	test("a shelf that failed to load deletes nothing", () => {
		const result = plan([entry("a", [{ type: "reading" }])], [], {
			loaded: new Set(),
		});
		expect(result.remove).toEqual([]);
		expect(result.update).toEqual([]);
	});

	test("a finished title stays seven days, then goes", () => {
		const finished = entry("a", [{ type: "series" }], {
			finishedAt: NOW - 3 * DAY,
		});
		expect(plan([finished], []).remove).toEqual([]);
		const later = plan([finished], [], {
			now: (finished.finishedAt as number) + FINISHED_GRACE_MS,
		});
		expect(later.remove).toEqual([{ kind: "book", uuid: "a" }]);
	});

	test("finishing a book takes it off Reading but the grace keeps it", () => {
		const result = plan(
			[entry("a", [{ type: "reading" }], { finishedAt: NOW - DAY })],
			[],
		);
		expect(result.remove).toEqual([]);
		expect(result.update).toEqual([{ kind: "book", uuid: "a", reasons: [] }]);
	});

	test("an offline collection keeps a finished title", () => {
		const result = plan(
			[
				entry("a", [{ type: "collection", id: "c1", name: "Viaje" }], {
					finishedAt: NOW - 30 * DAY,
				}),
			],
			[wanted("a", { type: "collection", id: "c1", name: "Viaje" })],
		);
		expect(result.remove).toEqual([]);
	});

	test("leaving one source keeps a title another still holds", () => {
		const result = plan(
			[
				entry("a", [
					{ type: "want" },
					{ type: "collection", id: "c1", name: "Viaje" },
				]),
			],
			[wanted("a", { type: "collection", id: "c1", name: "Viaje" })],
		);
		expect(result.remove).toEqual([]);
		expect(result.update[0].reasons).toEqual([
			{ type: "collection", id: "c1", name: "Viaje" },
		]);
	});

	test("with smart downloads off, finished titles stay", () => {
		const result = planSync({
			entries: [
				entry("a", [{ type: "series" }], { finishedAt: NOW - 30 * DAY }),
			],
			wanted: [],
			loaded: ALL,
			busy: new Set(),
			now: NOW,
			clearFinished: false,
		});
		expect(result.remove).toEqual([]);
	});

	test("a smart download cut off halfway is picked back up", () => {
		const result = plan(
			[entry("a", [{ type: "want" }], { complete: false })],
			[wanted("a", { type: "want" })],
		);
		expect(result.download).toEqual([
			{ kind: "book", uuid: "a", reasons: [{ type: "want" }] },
		]);
	});

	test("your own unfinished download waits for you to retry it", () => {
		const result = plan(
			[entry("a", [{ type: "manual" }], { complete: false })],
			[],
		);
		expect(result.download).toEqual([]);
	});

	test("titles still downloading are left alone", () => {
		const result = plan([entry("a", [{ type: "want" }])], [], {
			busy: new Set(["a"]),
		});
		expect(result.remove).toEqual([]);
	});
});

describe("progressFraction", () => {
	test("reads characters for books and seconds for audiobooks", () => {
		expect(
			progressFraction(["readingProgress", "saveProgress"], {
				exploredCharCount: 80,
				bookCharCount: 100,
			}),
		).toBe(0.8);
		expect(
			progressFraction(["listeningProgress", "saveProgress"], {
				currentTimeSeconds: 30,
				durationSeconds: 120,
			}),
		).toBe(0.25);
	});

	test("completed is the whole title; a save without totals says nothing", () => {
		expect(
			progressFraction(["readingProgress", "saveProgress"], {
				status: "completed",
			}),
		).toBe(1);
		expect(
			progressFraction(["readingProgress", "saveProgress"], {
				readingTimeSeconds: 40,
			}),
		).toBeNull();
	});
});

describe("nextInSeries", () => {
	test("follows the series order, not the list order", () => {
		const volumes = [
			{ uuid: "v3", position: 3 },
			{ uuid: "v1", position: 1 },
			{ uuid: "v2", position: 2 },
		];
		expect(nextInSeries(volumes, "v1")).toBe("v2");
		expect(nextInSeries(volumes, "v3")).toBeNull();
	});

	test("unnumbered volumes come after the numbered ones", () => {
		const volumes = [
			{ uuid: "extra", position: null },
			{ uuid: "v1", position: 1 },
		];
		expect(nextInSeries(volumes, "v1")).toBe("extra");
	});
});

describe("keeping and clearing", () => {
	test("keep makes a smart download the user's own", () => {
		expect(keepForever(entry("a", [{ type: "series" }]))).toEqual([
			{ type: "manual" },
			{ type: "series" },
		]);
	});

	test("days left before a finished title clears", () => {
		const finished = entry("a", [{ type: "series" }], {
			finishedAt: NOW - 2 * DAY,
		});
		expect(daysUntilCleared(finished, NOW)).toBe(5);
		expect(
			daysUntilCleared(
				entry("b", [{ type: "manual" }], { finishedAt: NOW }),
				NOW,
			),
		).toBeNull();
	});
});

describe("smartOrigin", () => {
	test("your own downloads carry no smart label", () => {
		expect(smartOrigin(entry("a", undefined))).toBeNull();
		expect(
			smartOrigin(entry("b", [{ type: "manual" }, { type: "want" }])),
		).toBeNull();
	});

	test("an offline collection names itself before the shelves", () => {
		expect(
			smartOrigin(
				entry("a", [
					{ type: "want" },
					{ type: "collection", id: "c1", name: "Viaje" },
				]),
			),
		).toEqual({ type: "collection", id: "c1", name: "Viaje" });
	});
});
