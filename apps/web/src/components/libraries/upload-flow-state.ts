import {
	isSupportedExtension,
	MAX_UPLOAD_BATCH_BYTES,
	MAX_UPLOAD_BYTES,
} from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";

/**
 * One row of the upload list. `pending` and `failed` are the only statuses that
 * still hold bytes to send; everything else is a terminal outcome the user reads.
 */
export type UploadItemStatus =
	| "pending"
	| "uploaded"
	/** The server accepted the request but did not keep this file. */
	| "skipped"
	/** Refused before any request (format, size) — retrying can never help. */
	| "rejected"
	/** Transfer or write error — retryable. */
	| "failed";

export interface UploadItem {
	/** Stable list key; also how a server result row is matched back. */
	id: string;
	file: File;
	status: UploadItemStatus;
	/** Machine reason behind a non-`uploaded` terminal status. */
	reason?: string;
}

export interface SelectionLimits {
	maxFileBytes?: number;
	maxBatchBytes?: number;
}

/** Server skip reasons that a retry can plausibly fix. */
function isRetryableReason(reason: string): boolean {
	return reason.startsWith("write_failed");
}

export function uploadItemKey(file: { name: string; size: number }): string {
	return `${file.name}:${file.size}`;
}

export function isSendable(item: UploadItem): boolean {
	return item.status === "pending" || item.status === "failed";
}

export function sendableItems(items: readonly UploadItem[]): UploadItem[] {
	return items.filter(isSendable);
}

export function retryableItems(items: readonly UploadItem[]): UploadItem[] {
	return items.filter((item) => item.status === "failed");
}

export function totalBytes(items: readonly UploadItem[]): number {
	return items.reduce((sum, item) => sum + item.file.size, 0);
}

/**
 * Appends a selection, keeping files that break a constraint in the list as
 * `rejected` rows: an error the user can read next to the offending name beats a
 * toast that disappears before they connect it to a file.
 */
export function addFilesToSelection(
	items: readonly UploadItem[],
	incoming: readonly File[],
	limits: SelectionLimits = {},
): UploadItem[] {
	const maxFileBytes = limits.maxFileBytes ?? MAX_UPLOAD_BYTES;
	const maxBatchBytes = limits.maxBatchBytes ?? MAX_UPLOAD_BATCH_BYTES;
	const seen = new Set(items.map((item) => item.id));
	const next = [...items];
	// Only bytes still queued for a request count against the batch limit.
	let queuedBytes = totalBytes(sendableItems(items));

	for (const file of incoming) {
		const id = uploadItemKey(file);
		if (seen.has(id)) continue;
		seen.add(id);

		if (!isSupportedExtension(file.name, "ebook")) {
			next.push({ id, file, status: "rejected", reason: "unsupported_type" });
			continue;
		}
		if (file.size > maxFileBytes) {
			next.push({ id, file, status: "rejected", reason: "too_large" });
			continue;
		}
		if (queuedBytes + file.size > maxBatchBytes) {
			next.push({ id, file, status: "rejected", reason: "batch_too_large" });
			continue;
		}
		queuedBytes += file.size;
		next.push({ id, file, status: "pending" });
	}
	return next;
}

export function removeItem(
	items: readonly UploadItem[],
	id: string,
): UploadItem[] {
	return items.filter((item) => item.id !== id);
}

/**
 * Per-file transfer state derived from the bytes acknowledged so far. Files go
 * up in one multipart request, in list order, so a cumulative offset is enough —
 * the boundary/header overhead between them is bytes against megabytes.
 */
export function transferStatuses(
	sent: readonly UploadItem[],
	loadedBytes: number,
): Map<string, "waiting" | "uploading" | "uploaded"> {
	const statuses = new Map<string, "waiting" | "uploading" | "uploaded">();
	let offset = 0;
	for (const item of sent) {
		const end = offset + item.file.size;
		statuses.set(
			item.id,
			loadedBytes >= end
				? "uploaded"
				: loadedBytes > offset
					? "uploading"
					: "waiting",
		);
		offset = end;
	}
	return statuses;
}

export function overallPercent(loaded: number, total: number): number {
	if (total <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
}

export interface UploadResult {
	uploaded: string[];
	skipped: { filename: string; reason: string }[];
}

/**
 * Folds a server response back into the list. Results carry basenames, so each
 * one is matched to the first sent item that still expects an outcome — two
 * files can share a name only if their sizes differ, and either row then reads
 * the same outcome.
 */
export function applyUploadResult(
	items: readonly UploadItem[],
	sentIds: readonly string[],
	result: UploadResult,
): UploadItem[] {
	const sent = new Set(sentIds);
	const outcomes = new Map<
		string,
		{ status: UploadItemStatus; reason?: string }
	>();
	const claimed = new Set<string>();

	const claim = (filename: string) => {
		const match = items.find(
			(item) =>
				sent.has(item.id) &&
				!claimed.has(item.id) &&
				item.file.name === filename,
		);
		if (match) claimed.add(match.id);
		return match;
	};

	for (const filename of result.uploaded) {
		const match = claim(filename);
		if (match) outcomes.set(match.id, { status: "uploaded" });
	}
	for (const { filename, reason } of result.skipped) {
		const match = claim(filename);
		if (match) {
			outcomes.set(match.id, {
				status: isRetryableReason(reason) ? "failed" : "skipped",
				reason,
			});
		}
	}

	return items.map((item) => {
		const outcome = outcomes.get(item.id);
		// Rebuilt rather than spread over the old row: a successful retry must not
		// keep the reason its previous failure left behind.
		if (outcome)
			return { id: item.id, file: item.file, ...outcome } satisfies UploadItem;
		// Sent but unaccounted for: never silently show it as still pending.
		if (sent.has(item.id) && isSendable(item)) {
			return { ...item, status: "failed" as const, reason: "no_result" };
		}
		return item;
	});
}

/** Marks the whole attempt failed so every sent file can be retried together. */
export function applyUploadFailure(
	items: readonly UploadItem[],
	sentIds: readonly string[],
	reason: string,
): UploadItem[] {
	const sent = new Set(sentIds);
	return items.map((item) =>
		sent.has(item.id) && isSendable(item)
			? { ...item, status: "failed" as const, reason }
			: item,
	);
}

export interface UploadSummary {
	pending: number;
	uploaded: number;
	skipped: number;
	failed: number;
	rejected: number;
	/** True once nothing is left to send and at least one attempt has landed. */
	settled: boolean;
}

export function summarize(items: readonly UploadItem[]): UploadSummary {
	const count = (status: UploadItemStatus) =>
		items.filter((item) => item.status === status).length;
	const summary = {
		pending: count("pending"),
		uploaded: count("uploaded"),
		skipped: count("skipped"),
		failed: count("failed"),
		rejected: count("rejected"),
	};
	return {
		...summary,
		settled:
			items.length > 0 &&
			summary.pending === 0 &&
			summary.uploaded + summary.skipped + summary.failed > 0,
	};
}
