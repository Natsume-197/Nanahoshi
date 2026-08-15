export interface PendingProgress {
	syncOperationId: string;
	bookUuid: string;
	exploredCharCount?: number;
	positionIntentAt?: number;
	bookCharCount: number;
	readingTimeSeconds: number;
	status: "reading" | "completed";
	savedAt: number;
}

export type PendingProgressEntry = Omit<PendingProgress, "savedAt">;
export type PendingQueue = Record<string, PendingProgress>;

/** Keep time slices as independent idempotent operations. Position ordering is
 * resolved atomically by the server when the operations are flushed. */
export function enqueuePendingProgress(
	queue: PendingQueue,
	entry: PendingProgressEntry,
	savedAt = Date.now(),
): PendingQueue {
	return {
		...queue,
		[entry.syncOperationId]: { ...entry, savedAt },
	};
}
