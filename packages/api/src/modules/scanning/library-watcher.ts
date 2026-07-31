import fs from "node:fs";
import path from "node:path";
import { scheduledScanQueue } from "../../infrastructure/queue/queues/scheduled-scan.queue";
import { logger } from "../../lib/logger";
import { libraryRepository } from "../../routers/libraries/library.repository";

const log = logger.child({ component: "library-watcher" });
const DEBOUNCE_MS = 5_000;

type ClosableWatcher = { close(): void };

/**
 * Coalesces filesystem event bursts into one incremental scan per library. The
 * scanner's full mode remains the repair path if a platform cannot provide a
 * recursive watcher (or events were lost while the process was down).
 */
export async function startLibraryWatchers(): Promise<{
	close(): Promise<void>;
}> {
	const libraries = await libraryRepository.findAll();
	const watchers: ClosableWatcher[] = [];
	const timers = new Map<number, ReturnType<typeof setTimeout>>();

	const enqueue = (libraryId: number, serverId: string) => {
		const pending = timers.get(libraryId);
		if (pending) clearTimeout(pending);
		timers.set(
			libraryId,
			setTimeout(() => {
				timers.delete(libraryId);
				void scheduledScanQueue
					.add("library-scan", {
						op: "scan",
						libraryId,
						serverId,
						mode: "incremental",
					})
					.catch((err) =>
						log.warn({ err, libraryId }, "Watch-triggered scan enqueue failed"),
					);
			}, DEBOUNCE_MS),
		);
	};

	for (const library of libraries) {
		const serverId = await libraryRepository.getServerIdByLibraryId(library.id);
		if (!serverId) continue;
		for (const libraryPath of library.paths ?? []) {
			if (libraryPath.isEnabled === false) continue;
			const root = path.resolve(libraryPath.path);
			try {
				const watcher = fs.watch(root, { recursive: true }, () =>
					enqueue(library.id, serverId),
				);
				watcher.on("error", (err) =>
					log.warn({ err, root }, "Library watcher error"),
				);
				watchers.push(watcher);
			} catch (err) {
				// Recursive watch support varies by OS/filesystem. Scheduled and
				// explicit full scans stay correct when it is unavailable.
				log.warn({ err, root }, "Recursive library watcher unavailable");
			}
		}
	}

	log.info({ watchers: watchers.length }, "Library watchers started");
	return {
		async close() {
			for (const timer of timers.values()) clearTimeout(timer);
			for (const watcher of watchers) watcher.close();
		},
	};
}
