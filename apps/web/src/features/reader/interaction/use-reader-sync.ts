import { useCallback, useEffect, useRef } from "react";
import { claimReadingTimeSlice } from "@/features/reader/renderers/shared/reading-time-slice";
import { useClearActivityOnUnmount } from "@/hooks/use-clear-activity-on-unmount";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useInterval } from "@/hooks/use-interval";
import { useWindowEvent } from "@/hooks/use-window-event";
import {
	invalidateReadingProgress,
	invalidateRecommendations,
} from "@/lib/invalidate-progress";
import { client } from "@/utils/orpc";

interface UseReaderSyncOptions {
	onRemoteProgress?: (
		progress: NonNullable<
			Awaited<ReturnType<typeof client.readingProgress.getProgress>>
		>,
	) => void;
	bookUuid: string;
	enabled: boolean;
	trackTime?: boolean;
	/** exploredCharCount undefined = the reader has not reported a position yet;
	 * the count is then omitted so existing server progress is never wiped. */
	getCharCounts: () => {
		exploredCharCount: number | undefined;
		bookCharCount: number;
		positionIntentAt: number | undefined;
	};
}

const SYNC_INTERVAL_MS = 45_000;
const COMPLETION_THRESHOLD = 0.9;

export function useReaderSync({
	bookUuid,
	enabled,
	trackTime = true,
	getCharCounts,
	onRemoteProgress,
}: UseReaderSyncOptions) {
	const lastSyncRef = useRef(Date.now());
	const syncRef = useRef<(() => Promise<void>) | undefined>(undefined);
	const lastPositionSnapshotRef = useRef<string | undefined>(undefined);
	const queueRef = useRef<Promise<void>>(Promise.resolve());
	const enqueue = useCallback((operation: () => Promise<void>) => {
		const queued = queueRef.current.then(operation, operation);
		queueRef.current = queued.catch(() => {});
		return queued;
	}, []);

	const performSync = useCallback(async () => {
		if (!enabled) return;

		const { exploredCharCount, bookCharCount, positionIntentAt } =
			getCharCounts();
		const positionSnapshot =
			exploredCharCount !== undefined && positionIntentAt !== undefined
				? `${exploredCharCount}:${positionIntentAt}`
				: undefined;
		const positionWrite =
			positionSnapshot !== undefined &&
			positionSnapshot !== lastPositionSnapshotRef.current
				? { exploredCharCount, positionIntentAt }
				: {};

		// Claim the time slice up front: advancing lastSyncRef before the await
		// keeps a second trigger firing in the same tick from re-sending it.
		const now = Date.now();
		const elapsedSinceLastSync = claimReadingTimeSlice(
			lastSyncRef.current,
			now,
		);
		lastSyncRef.current = now;

		const progress =
			exploredCharCount !== undefined && bookCharCount > 0
				? exploredCharCount / bookCharCount
				: 0;
		const newStatus =
			progress >= COMPLETION_THRESHOLD ? "completed" : "reading";
		try {
			// keepalive so syncs fired while the page is hiding/freezing (app
			// switch, tab close) start immediately and survive on mobile. The server
			// rejects an older intent if responses arrive out of order.
			await client.readingProgress.saveProgress(
				{
					bookUuid,
					...positionWrite,
					bookCharCount,
					...(trackTime ? { readingTimeSeconds: elapsedSinceLastSync } : {}),
					status: newStatus,
				},
				{ context: { keepalive: true } },
			);
			if (positionSnapshot) lastPositionSnapshotRef.current = positionSnapshot;
			invalidateReadingProgress();
		} catch (err) {
			console.error("Failed to sync reading progress:", err);
		}
	}, [bookUuid, enabled, getCharCounts, trackTime]);
	const syncProgress = useCallback(
		() => enqueue(performSync),
		[enqueue, performSync],
	);

	syncRef.current = syncProgress;

	const refreshSessionRef = useRef<object | null>(null);
	useEffect(() => {
		refreshSessionRef.current = { bookUuid, enabled };
		return () => {
			refreshSessionRef.current = null;
		};
	}, [bookUuid, enabled]);
	const remoteHandlerRef = useRef(onRemoteProgress);
	remoteHandlerRef.current = onRemoteProgress;
	const refreshProgress = () => {
		if (!enabled || !onRemoteProgress) return;
		const session = refreshSessionRef.current;
		void enqueue(async () => {
			try {
				const progress = await client.readingProgress.getProgress({ bookUuid });
				if (progress && session && session === refreshSessionRef.current)
					remoteHandlerRef.current?.(progress);
			} catch (err) {
				console.error("Failed to refresh reading progress:", err);
			}
		});
	};
	useWindowEvent("focus", refreshProgress);
	useWindowEvent("pageshow", refreshProgress);
	useWindowEvent("online", () => {
		refreshProgress();
		void syncRef.current?.();
	});

	// Sync progress when the tab is hidden (also covers mobile app switches)
	useDocumentEvent("visibilitychange", () => {
		if (document.visibilityState === "hidden") {
			syncRef.current?.();
		} else {
			refreshProgress();
		}
	});

	// Periodic sync
	useInterval(() => {
		if (enabled && document.visibilityState !== "hidden") {
			syncRef.current?.();
		}
	}, SYNC_INTERVAL_MS);

	const previousSessionRef = useRef({ enabled: false, bookUuid: "" });
	useEffect(() => {
		const previous = previousSessionRef.current;
		const started =
			enabled && (!previous.enabled || previous.bookUuid !== bookUuid);
		const stopped = previous.enabled && !enabled;
		previousSessionRef.current = { enabled, bookUuid };
		if (started) {
			lastPositionSnapshotRef.current = undefined;
			syncRef.current?.();
		}
		if (stopped) {
			enqueue(async () => {
				await client.presence
					.clearActivity({ context: { keepalive: true } })
					.catch(() => {});
			});
		}
	}, [bookUuid, enabled, enqueue]);

	// Sync on page close. beforeunload rarely fires on mobile, so pagehide
	// (which also covers bfcache freezes) is the one that matters there.
	useWindowEvent("beforeunload", () => {
		if (enabled) {
			syncRef.current?.();
		}
	});
	useWindowEvent("pagehide", () => {
		if (enabled) {
			syncRef.current?.();
		}
	});

	// Sync on unmount, then clear "reading" presence (see the hook for the
	// sync-before-clear ordering). Session end is the one strong signal worth a
	// recommendations refetch — the home they return to mounts already fresh.
	useClearActivityOnUnmount(() =>
		enabled
			? syncRef.current?.().then(() => invalidateRecommendations())
			: undefined,
	);

	return { syncNow: syncProgress };
}
