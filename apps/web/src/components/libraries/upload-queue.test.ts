import { describe, expect, test } from "bun:test";
import { applyUploadResult, type UploadItem } from "./upload-flow-state";
import {
	outcomeFromResponse,
	type SendOutcome,
	uploadOneByOne,
} from "./upload-queue";

function item(name: string, size: number): UploadItem {
	return {
		id: `${name}:${size}`,
		file: new File([new Uint8Array(size)], name),
		status: "pending",
	};
}

const uploaded = (name: string): SendOutcome => ({
	kind: "result",
	result: { uploaded: [name], skipped: [] },
});

describe("uploadOneByOne", () => {
	test("one failed file does not stop the rest, and stays retryable", async () => {
		const items = [item("a.epub", 3), item("b.epub", 4), item("c.epub", 5)];
		const outcome = await uploadOneByOne(items, async (it) =>
			it.file.name === "b.epub"
				? { kind: "failed", message: "Server exploded" }
				: uploaded(it.file.name),
		);

		const next = applyUploadResult(items, outcome.settledIds, outcome.result);
		expect(next.map((it) => it.status)).toEqual([
			"uploaded",
			"failed",
			"uploaded",
		]);
		expect(outcome.message).toBe("Server exploded");
	});

	test("cancelling keeps unsent files queued instead of marking them failed", async () => {
		const items = [item("a.epub", 3), item("b.epub", 4), item("c.epub", 5)];
		const outcome = await uploadOneByOne(items, async (it) =>
			it.file.name === "b.epub" ? { kind: "aborted" } : uploaded(it.file.name),
		);

		const next = applyUploadResult(items, outcome.settledIds, outcome.result);
		expect(outcome.aborted).toBe(true);
		expect(next.map((it) => it.status)).toEqual([
			"uploaded",
			"pending",
			"pending",
		]);
	});

	test("reports progress offsets that add up across files", async () => {
		const items = [item("a.epub", 3), item("b.epub", 4), item("c.epub", 5)];
		const offsets: number[] = [];
		await uploadOneByOne(items, async (it, before) => {
			offsets.push(before);
			return uploaded(it.file.name);
		});
		expect(offsets).toEqual([0, 3, 7]);
	});
});

describe("outcomeFromResponse", () => {
	test("a server-side rejection carries the file's own reason", () => {
		expect(
			outcomeFromResponse("a.epub", {
				ok: false,
				status: 400,
				body: { skipped: [{ filename: "a.epub", reason: "duplicate" }] },
			}),
		).toEqual({
			kind: "result",
			result: {
				uploaded: [],
				skipped: [{ filename: "a.epub", reason: "duplicate" }],
			},
		});
	});

	test("a bare 413 from a proxy reads as too large, not a retryable failure", () => {
		expect(
			outcomeFromResponse("a.epub", { ok: false, status: 413, body: null }),
		).toEqual({
			kind: "result",
			result: {
				uploaded: [],
				skipped: [{ filename: "a.epub", reason: "too_large" }],
			},
		});
	});

	test("an unexplained server error is retryable", () => {
		expect(
			outcomeFromResponse("a.epub", {
				ok: false,
				status: 500,
				body: { message: "boom" },
			}),
		).toEqual({ kind: "failed", message: "boom" });
	});
});
