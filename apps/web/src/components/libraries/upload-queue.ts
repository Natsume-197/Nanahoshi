import type { UploadItem, UploadResult } from "./upload-flow-state";

export type SendOutcome =
	| { kind: "result"; result: UploadResult }
	/** Request-level failure (network, auth, server error): retryable. */
	| { kind: "failed"; message?: string }
	| { kind: "aborted" };

export interface QueueOutcome {
	result: UploadResult;
	/** Items that got an answer; anything else is still waiting to be sent. */
	settledIds: string[];
	aborted: boolean;
	/** Server explanation behind the last request-level failure, if any. */
	message?: string;
}

/** Maps one single-file upload response to its outcome for that file. */
export function outcomeFromResponse(
	filename: string,
	response: { ok: boolean; status: number; body: unknown },
): SendOutcome {
	const body = response.body as {
		message?: string;
		uploaded?: string[];
		skipped?: { filename: string; reason: string }[];
	} | null;
	if (response.ok) {
		return {
			kind: "result",
			result: {
				uploaded: body?.uploaded ?? [filename],
				skipped: body?.skipped ?? [],
			},
		};
	}
	// A rejection still carries this file's reason (duplicate, too large…).
	if (body?.skipped?.length) {
		return { kind: "result", result: { uploaded: [], skipped: body.skipped } };
	}
	if (response.status === 413) {
		return {
			kind: "result",
			result: { uploaded: [], skipped: [{ filename, reason: "too_large" }] },
		};
	}
	return { kind: "failed", message: body?.message };
}

/**
 * Sends files one request at a time, so one bad file never sinks the rest and
 * the per-file limit is the only limit. Stops at the first abort; files not
 * yet sent stay queued.
 */
export async function uploadOneByOne(
	items: readonly UploadItem[],
	send: (item: UploadItem, bytesBefore: number) => Promise<SendOutcome>,
	isCancelled: () => boolean = () => false,
): Promise<QueueOutcome> {
	const result: UploadResult = { uploaded: [], skipped: [] };
	const settledIds: string[] = [];
	let message: string | undefined;
	let bytesBefore = 0;

	for (const item of items) {
		if (isCancelled()) return { result, settledIds, aborted: true, message };
		const outcome = await send(item, bytesBefore);
		if (outcome.kind === "aborted") {
			return { result, settledIds, aborted: true, message };
		}
		settledIds.push(item.id);
		bytesBefore += item.file.size;
		if (outcome.kind === "result") {
			result.uploaded.push(...outcome.result.uploaded);
			result.skipped.push(...outcome.result.skipped);
		} else {
			message = outcome.message ?? message;
			result.skipped.push({
				filename: item.file.name,
				reason: "request_failed",
			});
		}
	}
	return { result, settledIds, aborted: false, message };
}
