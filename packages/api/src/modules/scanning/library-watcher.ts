import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { scheduledScanQueue } from "../../infrastructure/queue/queues/scheduled-scan.queue";
import { logger } from "../../lib/logger";
import type { LibraryComplete } from "../../routers/libraries/library.model";
import { libraryRepository } from "../../routers/libraries/library.repository";

const log = logger.child({ component: "library-watcher" });
const DEBOUNCE_MS = 5_000;

type ClosableWatcher = { close(): void };
type WatchFilesystem = (
	root: string,
	options: { recursive: true },
	listener: () => void,
) => ClosableWatcher & {
	on(event: "error", listener: (err: Error) => void): void;
};

const watchersByLibrary = new Map<number, ClosableWatcher[]>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let started = false;
let excludedRealtimeWatchRoots: string[] = [];

function unescapeMountPath(value: string): string {
	return value
		.replace(/\\040/g, " ")
		.replace(/\\011/g, "\t")
		.replace(/\\012/g, "\n")
		.replace(/\\134/g, "\\");
}

function fuseMountRoots(mountInfo: string): string[] {
	return mountInfo.split("\n").flatMap((line) => {
		const fields = line.split(" ");
		const separator = fields.indexOf("-");
		if (separator < 0 || fields[separator + 1] !== "fuse.rclone") return [];
		const mountPoint = fields[4];
		return mountPoint ? [path.resolve(unescapeMountPath(mountPoint))] : [];
	});
}

function isInsideRoot(candidate: string, root: string): boolean {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function closeLibraryWatcher(libraryId: number) {
	const timer = timers.get(libraryId);
	if (timer) clearTimeout(timer);
	timers.delete(libraryId);
	for (const watcher of watchersByLibrary.get(libraryId) ?? []) watcher.close();
	watchersByLibrary.delete(libraryId);
}

function enqueue(libraryId: number, serverId: string) {
	const pending = timers.get(libraryId);
	if (pending) clearTimeout(pending);
	timers.set(
		libraryId,
		setTimeout(() => {
			timers.delete(libraryId);
			void scheduledScanQueue
				.add(
					"library-scan",
					{
						op: "scan",
						libraryId,
						serverId,
						mode: "incremental",
					},
					{
						deduplication: {
							id: `library-watch-${libraryId}`,
							keepLastIfActive: true,
						},
					},
				)
				.catch((err) =>
					log.warn({ err, libraryId }, "Watch-triggered scan enqueue failed"),
				);
		}, DEBOUNCE_MS),
	);
}

function installLibraryWatcher(
	library: LibraryComplete,
	serverId: string,
	watchFilesystem: WatchFilesystem,
) {
	closeLibraryWatcher(library.id);
	if (library.realtimeWatchEnabled === false) return;

	const watchers: ClosableWatcher[] = [];
	for (const libraryPath of library.paths ?? []) {
		if (libraryPath.isEnabled === false) continue;
		const root = path.resolve(libraryPath.path);
		if (
			excludedRealtimeWatchRoots.some((mountRoot) =>
				isInsideRoot(root, mountRoot),
			)
		) {
			log.warn(
				{ libraryId: library.id, root },
				"Skipping real-time watcher on rclone FUSE mount; use scheduled or manual scans",
			);
			continue;
		}
		try {
			const watcher = watchFilesystem(root, { recursive: true }, () =>
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
	if (watchers.length > 0) watchersByLibrary.set(library.id, watchers);
}

/** Apply a persisted library/path change to the live watcher process. */
export async function reconcileLibraryWatcher(
	libraryId: number,
): Promise<void> {
	if (!started) return;
	const library = (await libraryRepository.findAll()).find(
		(candidate) => candidate.id === libraryId,
	);
	if (!library) {
		closeLibraryWatcher(libraryId);
		return;
	}
	const serverId = await libraryRepository.getServerIdByLibraryId(libraryId);
	if (!serverId) {
		closeLibraryWatcher(libraryId);
		return;
	}
	installLibraryWatcher(library, serverId, fs.watch);
}

/**
 * Coalesces filesystem event bursts into one incremental scan per library. The
 * scanner's full mode remains the repair path if a platform cannot provide a
 * recursive watcher (or events were lost while the process was down).
 */
export async function startLibraryWatchers(options?: {
	watchFilesystem?: WatchFilesystem;
	readMountInfo?: () => Promise<string>;
}): Promise<{
	close(): Promise<void>;
}> {
	started = true;
	excludedRealtimeWatchRoots = fuseMountRoots(
		await (
			options?.readMountInfo ?? (() => readFile("/proc/self/mountinfo", "utf8"))
		)().catch(() => ""),
	);
	const libraries = await libraryRepository.findAll();
	for (const library of libraries) {
		const serverId = await libraryRepository.getServerIdByLibraryId(library.id);
		if (!serverId) continue;
		installLibraryWatcher(
			library,
			serverId,
			options?.watchFilesystem ?? fs.watch,
		);
	}

	log.info(
		{
			libraries: watchersByLibrary.size,
			watchers: [...watchersByLibrary.values()].reduce(
				(total, watchers) => total + watchers.length,
				0,
			),
		},
		"Library watchers started",
	);
	return {
		async close() {
			started = false;
			excludedRealtimeWatchRoots = [];
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
			for (const watchers of watchersByLibrary.values()) {
				for (const watcher of watchers) watcher.close();
			}
			watchersByLibrary.clear();
		},
	};
}
