import { client } from "@/utils/orpc";

export interface PendingProgress {
	ownerId: string;
	syncOperationId: string;
	bookUuid: string;
	exploredCharCount?: number;
	positionIntentAt?: number;
	bookCharCount: number;
	readingTimeSeconds: number;
	status: "reading" | "completed";
	savedAt: number;
}

export type PendingProgressEntry = Omit<PendingProgress, "savedAt" | "ownerId">;
type PendingQueue = Record<string, PendingProgress>;

export function enqueuePendingProgress(
	queue: PendingQueue,
	entry: PendingProgressEntry,
	ownerId: string,
	savedAt = Date.now(),
): PendingQueue {
	return {
		...queue,
		[entry.syncOperationId]: { ...entry, ownerId, savedAt },
	};
}

// Offline queue for failed progress syncs. Each reading-time slice lives in
// exactly one place — a delivered sync or a queue entry — so no double count.

const PENDING_KEY = "nanahoshi-pending-progress";
const PENDING_RETENTION_MS = 29 * 24 * 60 * 60 * 1_000;
let activeOwnerId: string | null = null;

export function setPendingProgressOwner(ownerId: string | null): void {
	activeOwnerId = ownerId;
}

function readQueue(): PendingQueue {
	try {
		const raw = window.localStorage.getItem(PENDING_KEY);
		if (!raw) return {};
		const stored = JSON.parse(raw) as Record<
			string,
			Omit<PendingProgress, "syncOperationId"> & { syncOperationId?: string }
		>;
		const queue = Object.fromEntries(
			Object.entries(stored).flatMap(([legacyKey, entry]) => {
				if (entry.savedAt < Date.now() - PENDING_RETENTION_MS) return [];
				// Pre-ownership entries cannot safely be attributed on a shared device.
				if (!("ownerId" in entry) || typeof entry.ownerId !== "string")
					return [];
				const syncOperationId = entry.syncOperationId ?? legacyKey;
				return [[syncOperationId, { ...entry, syncOperationId }]];
			}),
		);
		if (Object.keys(queue).length !== Object.keys(stored).length) {
			writeQueue(queue);
		}
		return queue;
	} catch {
		return {};
	}
}

function writeQueue(queue: PendingQueue) {
	try {
		if (Object.keys(queue).length === 0) {
			window.localStorage.removeItem(PENDING_KEY);
		} else {
			window.localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
		}
	} catch {
		// no-op (private mode, quota)
	}
}

export function markPendingProgress(entry: PendingProgressEntry): void {
	if (!activeOwnerId) return;
	writeQueue(enqueuePendingProgress(readQueue(), entry, activeOwnerId));
}

export function clearPendingProgress(syncOperationId: string): void {
	const queue = readQueue();
	if (!(syncOperationId in queue)) return;
	delete queue[syncOperationId];
	writeQueue(queue);
}

let flushing = false;

/** Entries that fail again stay queued. */
export async function flushPendingProgress(
	ownerId = activeOwnerId,
): Promise<void> {
	if (flushing || !ownerId) return;
	flushing = true;
	try {
		for (const entry of Object.values(readQueue())) {
			if (entry.ownerId !== ownerId) continue;
			try {
				await client.readingProgress.saveProgress({
					bookUuid: entry.bookUuid,
					syncOperationId: entry.syncOperationId,
					...(entry.exploredCharCount !== undefined && {
						exploredCharCount: entry.exploredCharCount,
					}),
					...(entry.positionIntentAt !== undefined && {
						positionIntentAt: entry.positionIntentAt,
					}),
					bookCharCount: entry.bookCharCount,
					readingTimeSeconds: entry.readingTimeSeconds,
					status: entry.status,
				});
				clearPendingProgress(entry.syncOperationId);
			} catch {
				// keep for the next flush
			}
		}
	} finally {
		flushing = false;
	}
}

export function clearPendingProgressForOwner(ownerId = activeOwnerId): void {
	if (!ownerId) return;
	writeQueue(
		Object.fromEntries(
			Object.entries(readQueue()).filter(
				([, entry]) => entry.ownerId !== ownerId,
			),
		),
	);
}
