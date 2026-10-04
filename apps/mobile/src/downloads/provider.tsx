import { onlineManager, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	use,
	useState,
	useSyncExternalStore,
} from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import type { Api } from "@/lib/api";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { usePlayer } from "@/player/provider";
import { ExportManager } from "./export";
import { listDownloads, readEntry } from "./files";
import { DownloadManager, type DownloadsSnapshot } from "./manager";
import { type DownloadKind, sortEntries } from "./model";
import { connectDownloadNotification } from "./notifier";
import { SmartDownloads } from "./smart-engine";

const DownloadsContext = createContext<DownloadManager | null>(null);
const ExportsContext = createContext<ExportManager | null>(null);
const SmartContext = createContext<SmartDownloads | null>(null);

/** One manager per server connection, like the player. */
export function DownloadsProvider({
	serverUrl,
	auth,
	api,
	children,
}: {
	serverUrl: string;
	auth: NanahoshiAuth;
	api: Api;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const [manager] = useState(
		() => new DownloadManager({ serverUrl, auth, api, queryClient }),
	);
	const [exports] = useState(
		() => new ExportManager({ serverUrl, auth, api, queryClient }),
	);
	const player = usePlayer();
	const [smart] = useState(
		() =>
			new SmartDownloads({
				api,
				auth,
				manager,
				inUse: () => player.getSnapshot().book?.uuid ?? null,
			}),
	);
	useMountEffect(() => smart.start());
	useMountEffect(() =>
		connectDownloadNotification(manager, () => smart.pause()),
	);
	return (
		<DownloadsContext value={manager}>
			<ExportsContext value={exports}>
				<SmartContext value={smart}>{children}</SmartContext>
			</ExportsContext>
		</DownloadsContext>
	);
}

export function useSmartDownloadsEngine(): SmartDownloads {
	const smart = use(SmartContext);
	if (!smart)
		throw new Error(
			"useSmartDownloadsEngine must be used inside DownloadsProvider",
		);
	return smart;
}

export function useDownloads(): DownloadManager {
	const manager = use(DownloadsContext);
	if (!manager)
		throw new Error("useDownloads must be used inside DownloadsProvider");
	return manager;
}

export function useExports(): ExportManager {
	const exports = use(ExportsContext);
	if (!exports)
		throw new Error("useExports must be used inside DownloadsProvider");
	return exports;
}

/** The file being exported, for the progress bar. */
export function useExportJob() {
	const exports = useExports();
	return useSyncExternalStore(exports.subscribe, exports.getSnapshot);
}

function useDownloadsState<T>(select: (snapshot: DownloadsSnapshot) => T): T {
	const manager = useDownloads();
	return useSyncExternalStore(manager.subscribe, () =>
		select(manager.getSnapshot()),
	);
}

/** The server whose titles the phone shows (the session's active one). */
export function useActiveServerId(): string | null {
	// Through the manager, not useConnection: app-provider mounts this module.
	return (
		useDownloads().auth.useSession().data?.session.activeOrganizationId ?? null
	);
}

export type TitleDownloadState =
	| { state: "none" }
	| { state: "queued" | "downloading"; progress: number }
	| { state: "failed" | "partial" }
	| { state: "done" };

/** One title's place on the device, for its download button and menu. */
export function useTitleDownload(
	kind: DownloadKind,
	uuid: string,
): TitleDownloadState & { serverId: string | null } {
	const serverId = useActiveServerId();
	const job = useDownloadsState((s) => s.jobs[uuid]);
	const entry = useDiskRead(`entry:${kind}:${serverId}:${uuid}`, () =>
		serverId ? readEntry(kind, serverId, uuid) : null,
	);
	if (job?.status === "failed") return { state: "failed", serverId };
	if (job) return { state: job.status, progress: job.progress, serverId };
	if (!entry) return { state: "none", serverId };
	return { state: entry.complete ? "done" : "partial", serverId };
}

/** Titles on this device for the active server, unfinished ones first. */
export function useDownloadedTitles() {
	const serverId = useActiveServerId();
	const jobs = useDownloadsState((s) => s.jobs);
	const titles = useDiskRead(`list:${serverId}`, () =>
		serverId ? sortEntries(listDownloads(serverId)) : [],
	);
	return { serverId, titles, jobs };
}

/**
 * Disk reads cached until the manager's `version` moves. Not useMemo: the
 * React Compiler keys memos on what the callback reads, so a `version` dep
 * the callback ignores was dropped and the reads went stale.
 */
const diskCaches = new WeakMap<
	DownloadManager,
	Map<string, { version: number; value: unknown }>
>();

function useDiskRead<T>(key: string, read: () => T): T {
	const manager = useDownloads();
	const version = useDownloadsState((s) => s.version);
	let cache = diskCaches.get(manager);
	if (!cache) {
		cache = new Map();
		diskCaches.set(manager, cache);
	}
	const hit = cache.get(key);
	if (hit && hit.version === version) return hit.value as T;
	const value = read();
	cache.set(key, { version, value });
	return value;
}

/** Whether a title opens without the server, or null while online (nothing
 * to tell apart then). One disk listing per change, shared by every tile. */
export function useAvailableOffline(uuid: string): boolean | null {
	const online = useIsOnline();
	const serverId = useActiveServerId();
	const onPhone = useDiskRead(
		`complete:${serverId}`,
		() =>
			new Set(
				serverId
					? listDownloads(serverId)
							.filter((entry) => entry.complete)
							.map((entry) => entry.uuid)
					: [],
			),
	);
	if (online || !serverId) return null;
	return onPhone.has(uuid);
}

/** The device's network, as React Query sees it (see query-lifecycle). */
export function useIsOnline(): boolean {
	return useSyncExternalStore(
		(listener) => onlineManager.subscribe(listener),
		() => onlineManager.isOnline(),
	);
}
