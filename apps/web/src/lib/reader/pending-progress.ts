import { client } from "@/utils/orpc";

// Offline queue for failed progress syncs. Each reading-time slice lives in
// exactly one place — a delivered sync or a queue entry — so no double count.

const PENDING_KEY = "nanahoshi-pending-progress";

export interface PendingProgress {
	bookUuid: string;
	exploredCharCount?: number;
	bookCharCount: number;
	readingTimeSeconds: number;
	status: "reading" | "completed";
	savedAt: number;
}

type PendingQueue = Record<string, PendingProgress>;

function readQueue(): PendingQueue {
	try {
		const raw = window.localStorage.getItem(PENDING_KEY);
		return raw ? JSON.parse(raw) : {};
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

/** Reading time accumulates across failures; position/status take the latest. */
export function markPendingProgress(
	entry: Omit<PendingProgress, "savedAt">,
): void {
	const queue = readQueue();
	const existing = queue[entry.bookUuid];
	queue[entry.bookUuid] = {
		...entry,
		readingTimeSeconds:
			entry.readingTimeSeconds + (existing?.readingTimeSeconds ?? 0),
		savedAt: Date.now(),
	};
	writeQueue(queue);
}

export function clearPendingProgress(bookUuid: string): void {
	const queue = readQueue();
	if (!(bookUuid in queue)) return;
	delete queue[bookUuid];
	writeQueue(queue);
}

let flushing = false;

/** Entries that fail again stay queued. */
export async function flushPendingProgress(): Promise<void> {
	if (flushing) return;
	flushing = true;
	try {
		for (const entry of Object.values(readQueue())) {
			try {
				await client.readingProgress.saveProgress({
					bookUuid: entry.bookUuid,
					...(entry.exploredCharCount !== undefined && {
						exploredCharCount: entry.exploredCharCount,
					}),
					bookCharCount: entry.bookCharCount,
					readingTimeSeconds: entry.readingTimeSeconds,
					status: entry.status,
				});
				clearPendingProgress(entry.bookUuid);
			} catch {
				// keep for the next flush
			}
		}
	} finally {
		flushing = false;
	}
}
