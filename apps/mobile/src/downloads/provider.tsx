import { onlineManager, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	use,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import type { Api } from "@/lib/api";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { ExportManager } from "./export";
import { listDownloads, readEntry } from "./files";
import { DownloadManager, type DownloadsSnapshot } from "./manager";
import { type DownloadKind, sortEntries } from "./model";

const DownloadsContext = createContext<DownloadManager | null>(null);
const ExportsContext = createContext<ExportManager | null>(null);

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
	return (
		<DownloadsContext value={manager}>
			<ExportsContext value={exports}>{children}</ExportsContext>
		</DownloadsContext>
	);
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
	const version = useDownloadsState((s) => s.version);
	// biome-ignore lint/correctness/useExhaustiveDependencies: version marks disk changes
	const entry = useMemo(
		() => (serverId ? readEntry(kind, serverId, uuid) : null),
		[kind, serverId, uuid, version],
	);
	if (job?.status === "failed") return { state: "failed", serverId };
	if (job) return { state: job.status, progress: job.progress, serverId };
	if (!entry) return { state: "none", serverId };
	return { state: entry.complete ? "done" : "partial", serverId };
}

/** Titles on this device for the active server, unfinished ones first. */
export function useDownloadedTitles() {
	const serverId = useActiveServerId();
	const version = useDownloadsState((s) => s.version);
	const jobs = useDownloadsState((s) => s.jobs);
	// biome-ignore lint/correctness/useExhaustiveDependencies: version marks disk changes
	const titles = useMemo(
		() => (serverId ? sortEntries(listDownloads(serverId)) : []),
		[serverId, version],
	);
	return { serverId, titles, jobs };
}

let onDevice = { key: "", uuids: new Set<string>() };

/** Whether a title opens without the server, or null while online (nothing
 * to tell apart then). One disk listing per change, shared by every tile. */
export function useAvailableOffline(uuid: string): boolean | null {
	const online = useIsOnline();
	const serverId = useActiveServerId();
	const version = useDownloadsState((s) => s.version);
	if (online || !serverId) return null;
	const key = `${serverId}:${version}`;
	if (onDevice.key !== key) {
		onDevice = {
			key,
			uuids: new Set(
				listDownloads(serverId)
					.filter((entry) => entry.complete)
					.map((entry) => entry.uuid),
			),
		};
	}
	return onDevice.uuids.has(uuid);
}

/** The device's network, as React Query sees it (see query-lifecycle). */
export function useIsOnline(): boolean {
	return useSyncExternalStore(
		(listener) => onlineManager.subscribe(listener),
		() => onlineManager.isOnline(),
	);
}
