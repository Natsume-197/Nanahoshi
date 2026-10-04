import {
	isSupportedExtension,
	MAX_UPLOAD_BYTES,
} from "@nanahoshi/api/modules/scanning/supportedExtensions";

export type UploadStatus =
	| "queued"
	| "uploading"
	| "processing"
	| "uploaded"
	| "skipped"
	| "failed";

export type UploadEntry = {
	id: string;
	name: string;
	size: number;
	status: UploadStatus;
	/** 0..1 while this file's bytes are going up. */
	progress: number;
	/** The server's (or our pre-check's) reason a file didn't make it. */
	reason?: string;
	/** The server task turning an uploaded file into a book. */
	taskId?: string;
};

export type PickedFile = { uri: string; name: string; size: number };

/** Adds picked files, skipping ones already listed and pre-rejecting what the
 * server would refuse anyway, so nothing waits for a request that can't pass. */
export function addPicked(
	entries: readonly UploadEntry[],
	picked: readonly PickedFile[],
): UploadEntry[] {
	const next = [...entries];
	const seen = new Set(entries.map((entry) => entry.id));
	for (const file of picked) {
		const id = `${file.name}:${file.size}`;
		if (seen.has(id)) continue;
		seen.add(id);
		const reason = !isSupportedExtension(file.name, "ebook")
			? "unsupported_type"
			: file.size > MAX_UPLOAD_BYTES
				? "too_large"
				: undefined;
		next.push({
			id,
			name: file.name,
			size: file.size,
			status: reason ? "skipped" : "queued",
			progress: 0,
			reason,
		});
	}
	return next;
}

/** What the next "Upload" sends: new files and ones that failed in transit. */
export function sendable(entries: readonly UploadEntry[]): UploadEntry[] {
	return entries.filter(
		(entry) => entry.status === "queued" || entry.status === "failed",
	);
}

export function patchEntry(
	entries: readonly UploadEntry[],
	id: string,
	patch: Partial<UploadEntry>,
): UploadEntry[] {
	return entries.map((entry) =>
		entry.id === id ? { ...entry, ...patch } : entry,
	);
}

/** Maps the upload route's answer for one file onto that file's row. */
export function outcomeFromResponse(response: {
	status: number;
	body: string;
}): Pick<UploadEntry, "status" | "reason" | "taskId"> {
	let parsed: {
		skipped?: { reason: string }[];
		taskId?: string;
	} | null = null;
	try {
		parsed = response.body ? JSON.parse(response.body) : null;
	} catch {
		parsed = null;
	}
	if (response.status >= 200 && response.status < 300) {
		return parsed?.taskId
			? { status: "uploaded", taskId: parsed.taskId }
			: { status: "uploaded" };
	}
	// A rejection still names this file's reason (duplicate, too large…).
	const reason = parsed?.skipped?.[0]?.reason;
	if (reason) return { status: "skipped", reason };
	if (response.status === 413)
		return { status: "skipped", reason: "too_large" };
	return { status: "failed", reason: "request_failed" };
}

/** The message key the web upload modal uses for each reason. */
export function reasonKey(reason: string | undefined): string | null {
	if (!reason) return null;
	if (reason.startsWith("write_failed"))
		return "library.upload_reason_write_failed";
	switch (reason) {
		case "unsupported_type":
		case "too_large":
		case "duplicate":
		case "already_exists":
		case "request_failed":
			return `library.upload_reason_${reason}`;
		case "invalid_name":
		case "invalid_path":
			return "library.upload_reason_invalid_name";
		default:
			return "library.upload_reason_unknown";
	}
}

export function summarize(entries: readonly UploadEntry[]) {
	let uploaded = 0;
	let problems = 0;
	let pending = 0;
	for (const entry of entries) {
		if (entry.status === "uploaded") uploaded += 1;
		else if (entry.status === "skipped" || entry.status === "failed")
			problems += 1;
		else pending += 1;
	}
	return { uploaded, problems, pending };
}

/** Bytes acknowledged across a batch, for the one overall progress bar. */
export function batchProgress(entries: readonly UploadEntry[]): number {
	let total = 0;
	let done = 0;
	for (const entry of entries) {
		if (entry.status === "skipped" && entry.progress === 0) continue;
		total += entry.size;
		done +=
			entry.status === "uploaded" || entry.status === "processing"
				? entry.size
				: entry.size * entry.progress;
	}
	return total > 0 ? Math.min(1, done / total) : 0;
}
