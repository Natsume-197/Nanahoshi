import { describe, expect, test } from "bun:test";
import {
	addPicked,
	batchProgress,
	outcomeFromResponse,
	patchEntry,
	reasonKey,
	sendable,
	summarize,
} from "./upload-queue";

const epub = { uri: "file:///a.epub", name: "a.epub", size: 1000 };

describe("addPicked", () => {
	test("queues supported books and pre-rejects other files", () => {
		const entries = addPicked(
			[],
			[epub, { uri: "file:///b.docx", name: "b.docx", size: 10 }],
		);
		expect(entries.map((entry) => [entry.name, entry.status])).toEqual([
			["a.epub", "queued"],
			["b.docx", "skipped"],
		]);
		expect(entries[1]?.reason).toBe("unsupported_type");
	});

	test("picking the same file twice lists it once", () => {
		const once = addPicked([], [epub]);
		expect(addPicked(once, [epub])).toHaveLength(1);
	});

	test("a file over the server limit never gets sent", () => {
		const [entry] = addPicked(
			[],
			[{ uri: "file:///big.cbz", name: "big.cbz", size: 3 * 1024 ** 3 }],
		);
		expect(entry?.reason).toBe("too_large");
		expect(sendable(entry ? [entry] : [])).toHaveLength(0);
	});
});

describe("outcomeFromResponse", () => {
	test("a stored file carries the task that turns it into a book", () => {
		expect(
			outcomeFromResponse({
				status: 200,
				body: JSON.stringify({ uploaded: ["a.epub"], taskId: "t1" }),
			}),
		).toEqual({ status: "uploaded", taskId: "t1" });
	});

	test("a duplicate rejection keeps the server's reason", () => {
		expect(
			outcomeFromResponse({
				status: 400,
				body: JSON.stringify({ skipped: [{ reason: "duplicate" }] }),
			}),
		).toEqual({ status: "skipped", reason: "duplicate" });
	});

	test("a server error without a reason is retryable", () => {
		const outcome = outcomeFromResponse({ status: 502, body: "<html>" });
		expect(outcome.status).toBe("failed");
		const entries = patchEntry(addPicked([], [epub]), "a.epub:1000", outcome);
		expect(sendable(entries)).toHaveLength(1);
	});
});

test("every reason maps to a translated message", () => {
	expect(reasonKey("write_failed (EACCES)")).toBe(
		"library.upload_reason_write_failed",
	);
	expect(reasonKey("something_new")).toBe("library.upload_reason_unknown");
});

test("summary and progress count only what was attempted", () => {
	let entries = addPicked(
		[],
		[
			epub,
			{ uri: "file:///b.epub", name: "b.epub", size: 3000 },
			{ uri: "file:///c.txt", name: "c.txt", size: 50 },
		],
	);
	entries = patchEntry(entries, "a.epub:1000", { status: "uploaded" });
	entries = patchEntry(entries, "b.epub:3000", {
		status: "uploading",
		progress: 0.5,
	});
	expect(batchProgress(entries)).toBeCloseTo(2500 / 4000);
	expect(summarize(entries)).toEqual({ uploaded: 1, problems: 1, pending: 1 });
});
