import { describe, expect, test } from "bun:test";
import {
	addFilesToSelection,
	applyUploadFailure,
	applyUploadResult,
	overallPercent,
	removeItem,
	retryableItems,
	sendableItems,
	summarize,
	totalBytes,
	transferStatuses,
	type UploadItem,
	uploadItemKey,
} from "../upload-flow-state";

const file = (name: string, size = 10) =>
	new File([new Uint8Array(size)], name, { type: "application/octet-stream" });

const limits = { maxFileBytes: 100, maxBatchBytes: 200 };

const statuses = (items: UploadItem[]) =>
	items.map((item) => [item.file.name, item.status, item.reason ?? null]);

describe("upload selection", () => {
	test("accepts supported ebook files and ignores exact duplicates", () => {
		let items = addFilesToSelection(
			[],
			[file("a.epub"), file("b.cbz")],
			limits,
		);
		items = addFilesToSelection(
			items,
			[file("a.epub"), file("c.mobi")],
			limits,
		);
		expect(items.map((item) => item.file.name)).toEqual([
			"a.epub",
			"b.cbz",
			"c.mobi",
		]);
		expect(items.every((item) => item.status === "pending")).toBe(true);
	});

	test("keeps unsupported files in the list with a reason instead of dropping them", () => {
		const items = addFilesToSelection(
			[],
			[file("notes.txt"), file("good.epub")],
			limits,
		);
		expect(statuses(items)).toEqual([
			["notes.txt", "rejected", "unsupported_type"],
			["good.epub", "pending", null],
		]);
	});

	test("rejects a file over the per-file limit", () => {
		const items = addFilesToSelection([], [file("big.epub", 101)], limits);
		expect(statuses(items)).toEqual([["big.epub", "rejected", "too_large"]]);
	});

	test("rejects only the files that overflow the batch limit", () => {
		const items = addFilesToSelection(
			[],
			[file("a.epub", 150), file("b.epub", 60), file("c.epub", 40)],
			{ maxFileBytes: 200, maxBatchBytes: 200 },
		);
		expect(statuses(items)).toEqual([
			["a.epub", "pending", null],
			["b.epub", "rejected", "batch_too_large"],
			["c.epub", "pending", null],
		]);
	});

	test("rejected files free up room in the batch budget", () => {
		let items = addFilesToSelection([], [file("bad.txt", 200)], limits);
		items = addFilesToSelection(items, [file("ok.epub", 100)], limits);
		expect(statuses(items)).toEqual([
			["bad.txt", "rejected", "unsupported_type"],
			["ok.epub", "pending", null],
		]);
	});

	test("removing a file drops only that row", () => {
		const items = addFilesToSelection([], [file("a.epub"), file("b.epub")]);
		const next = removeItem(items, uploadItemKey(items[1].file));
		expect(next.map((item) => item.file.name)).toEqual(["a.epub"]);
	});

	test("only pending and failed rows count as sendable", () => {
		const items: UploadItem[] = [
			{ id: "1", file: file("a.epub", 5), status: "pending" },
			{ id: "2", file: file("b.epub", 7), status: "failed" },
			{ id: "3", file: file("c.epub", 9), status: "uploaded" },
			{ id: "4", file: file("d.epub", 11), status: "rejected" },
		];
		expect(sendableItems(items).map((item) => item.id)).toEqual(["1", "2"]);
		expect(totalBytes(sendableItems(items))).toBe(12);
		expect(retryableItems(items).map((item) => item.id)).toEqual(["2"]);
	});
});

describe("transfer progress", () => {
	const sent: UploadItem[] = [
		{ id: "1", file: file("a.epub", 100), status: "pending" },
		{ id: "2", file: file("b.epub", 100), status: "pending" },
	];

	test("maps acknowledged bytes onto per-file states", () => {
		expect([...transferStatuses(sent, 0).values()]).toEqual([
			"waiting",
			"waiting",
		]);
		expect([...transferStatuses(sent, 50).values()]).toEqual([
			"uploading",
			"waiting",
		]);
		expect([...transferStatuses(sent, 150).values()]).toEqual([
			"uploaded",
			"uploading",
		]);
		expect([...transferStatuses(sent, 200).values()]).toEqual([
			"uploaded",
			"uploaded",
		]);
	});

	test("clamps the overall percentage", () => {
		expect(overallPercent(0, 0)).toBe(0);
		expect(overallPercent(25, 200)).toBe(13);
		expect(overallPercent(300, 200)).toBe(100);
	});
});

describe("upload outcomes", () => {
	const base = () =>
		addFilesToSelection([], [file("a.epub"), file("b.epub"), file("c.epub")]);

	test("marks uploaded, skipped and retryable rows from one response", () => {
		const items = base();
		const ids = items.map((item) => item.id);
		const next = applyUploadResult(items, ids, {
			uploaded: ["a.epub"],
			skipped: [
				{ filename: "b.epub", reason: "duplicate" },
				{ filename: "c.epub", reason: "write_failed (ENOSPC)" },
			],
		});
		expect(statuses(next)).toEqual([
			["a.epub", "uploaded", null],
			["b.epub", "skipped", "duplicate"],
			["c.epub", "failed", "write_failed (ENOSPC)"],
		]);
		expect(retryableItems(next)).toHaveLength(1);
	});

	test("a sent file the server never mentions becomes retryable, never pending", () => {
		const items = base();
		const next = applyUploadResult(
			items,
			items.map((item) => item.id),
			{ uploaded: ["a.epub"], skipped: [] },
		);
		expect(statuses(next).slice(1)).toEqual([
			["b.epub", "failed", "no_result"],
			["c.epub", "failed", "no_result"],
		]);
	});

	test("files left out of the batch keep their status", () => {
		const items = base();
		const next = applyUploadResult(items, [items[0].id], {
			uploaded: ["a.epub"],
			skipped: [],
		});
		expect(statuses(next)).toEqual([
			["a.epub", "uploaded", null],
			["b.epub", "pending", null],
			["c.epub", "pending", null],
		]);
	});

	test("a request-level failure marks every sent file retryable", () => {
		const items = base();
		const next = applyUploadFailure(
			items,
			items.map((item) => item.id),
			"request_failed",
		);
		expect(next.every((item) => item.status === "failed")).toBe(true);
		expect(retryableItems(next)).toHaveLength(3);
	});

	test("a retry leaves already uploaded rows alone and clears the old reason", () => {
		const items = base();
		const first = applyUploadResult(
			items,
			items.map((item) => item.id),
			{
				uploaded: ["a.epub"],
				skipped: [{ filename: "b.epub", reason: "write_failed" }],
			},
		);
		const retryIds = retryableItems(first).map((item) => item.id);
		const second = applyUploadResult(first, retryIds, {
			uploaded: ["b.epub"],
			skipped: [],
		});
		expect(statuses(second)).toEqual([
			["a.epub", "uploaded", null],
			["b.epub", "uploaded", null],
			["c.epub", "failed", "no_result"],
		]);
	});

	test("summarize reports the settled state only once nothing is queued", () => {
		const items = base();
		expect(summarize(items).settled).toBe(false);
		const next = applyUploadResult(
			items,
			items.map((item) => item.id),
			{
				uploaded: ["a.epub", "b.epub"],
				skipped: [{ filename: "c.epub", reason: "duplicate" }],
			},
		);
		expect(summarize(next)).toEqual({
			pending: 0,
			uploaded: 2,
			skipped: 1,
			failed: 0,
			rejected: 0,
			settled: true,
		});
	});
});
