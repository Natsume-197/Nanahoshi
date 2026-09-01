import { useCallback, useEffect, useRef } from "react";
import { useClearActivityOnUnmount } from "@/hooks/use-clear-activity-on-unmount";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useInterval } from "@/hooks/use-interval";
import { useWindowEvent } from "@/hooks/use-window-event";
import {
	invalidateListeningProgress,
	invalidateRecommendations,
} from "@/lib/invalidate-progress";
import { client } from "@/utils/orpc";

interface UsePlayerSyncOptions {
	bookUuid: string;
	enabled: boolean;
	getPlaybackState: () => {
		currentTime: number;
		duration: number;
		playbackRate: number;
	};
}

interface SyncOptions {
	/** Save even when playback has just been paused. */
	force?: boolean;
	/** Let a final sync complete while the document is closing or freezing. */
	keepalive?: boolean;
}

const SYNC_INTERVAL_MS = 45_000;
const COMPLETION_THRESHOLD = 0.95;

export function usePlayerSync({
	bookUuid,
	enabled,
	getPlaybackState,
}: UsePlayerSyncOptions) {
	const lastSyncRef = useRef(Date.now());
	const syncRef = useRef<
		((options?: SyncOptions) => Promise<void>) | undefined
	>(undefined);
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;
	const bookUuidRef = useRef(bookUuid);
	const completedRef = useRef(false);
	if (bookUuidRef.current !== bookUuid) completedRef.current = false;
	bookUuidRef.current = bookUuid;
	const getPlaybackStateRef = useRef(getPlaybackState);
	getPlaybackStateRef.current = getPlaybackState;
	const performSync = useCallback(async (options: SyncOptions = {}) => {
		if (!options.force && !enabledRef.current) return;

		try {
			const { currentTime, duration, playbackRate } =
				getPlaybackStateRef.current();

			const elapsedSinceLastSync = Math.floor(
				(Date.now() - lastSyncRef.current) / 1000,
			);
			const progress = duration > 0 ? currentTime / duration : 0;
			const newStatus: "completed" | "listening" =
				progress >= COMPLETION_THRESHOLD ? "completed" : "listening";

			const payload = {
				bookUuid: bookUuidRef.current,
				currentTimeSeconds: currentTime,
				durationSeconds: duration,
				playbackRate,
				listeningTimeSeconds: elapsedSinceLastSync,
				status: newStatus,
			};
			if (options.keepalive) {
				await client.listeningProgress.saveProgress(payload, {
					context: { keepalive: true },
				});
			} else {
				await client.listeningProgress.saveProgress(payload);
			}

			lastSyncRef.current = Date.now();
			invalidateListeningProgress();
			// The persistent mini-player never unmounts, so the completion
			// transition is its "session end" recommendation signal.
			if (newStatus === "completed" && !completedRef.current) {
				invalidateRecommendations();
			}
			completedRef.current = newStatus === "completed";
		} catch (err) {
			console.error("Failed to sync listening progress:", err);
		}
	}, []);
	const queueRef = useRef<Promise<void>>(Promise.resolve());
	const enqueue = useCallback((operation: () => Promise<void>) => {
		const queued = queueRef.current.then(operation, operation);
		queueRef.current = queued.catch(() => {});
		return queued;
	}, []);
	const syncProgress = useCallback(
		(options?: SyncOptions) => enqueue(() => performSync(options)),
		[enqueue, performSync],
	);

	syncRef.current = syncProgress;

	// visibilitychange fires reliably before page unload in modern browsers
	useDocumentEvent("visibilitychange", () => {
		if (document.visibilityState === "hidden") {
			syncRef.current?.({ keepalive: true });
		}
	});

	// Some browsers skip visibilitychange during a close. pagehide covers mobile
	// freezes and beforeunload covers the remaining desktop cases.
	useWindowEvent("beforeunload", () => {
		syncRef.current?.({ keepalive: true });
	});
	useWindowEvent("pagehide", () => {
		syncRef.current?.({ keepalive: true });
	});

	useInterval(() => {
		if (enabledRef.current) {
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

		if (started) syncRef.current?.();
		if (stopped) {
			enqueue(async () => {
				await performSync({ force: true, keepalive: true });
				await client.presence
					.clearActivity({ context: { keepalive: true } })
					.catch(() => {});
			});
		}
	}, [bookUuid, enabled, enqueue, performSync]);

	// Sync on unmount, then clear "listening" presence (see the hook for the
	// sync-before-clear ordering).
	useClearActivityOnUnmount(async () => {
		if (enabledRef.current) await syncRef.current?.({ keepalive: true });
	});

	return { syncNow: syncProgress };
}
