import { useCallback, useEffect, useRef } from "react";
import { useClearActivityOnUnmount } from "@/hooks/use-clear-activity-on-unmount";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useInterval } from "@/hooks/use-interval";
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

const SYNC_INTERVAL_MS = 45_000;
const COMPLETION_THRESHOLD = 0.95;

export function usePlayerSync({
	bookUuid,
	enabled,
	getPlaybackState,
}: UsePlayerSyncOptions) {
	const lastSyncRef = useRef(Date.now());
	const syncRef = useRef<(() => Promise<void>) | undefined>(undefined);
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;
	const bookUuidRef = useRef(bookUuid);
	const completedRef = useRef(false);
	if (bookUuidRef.current !== bookUuid) completedRef.current = false;
	bookUuidRef.current = bookUuid;
	const getPlaybackStateRef = useRef(getPlaybackState);
	getPlaybackStateRef.current = getPlaybackState;
	const performSync = useCallback(async () => {
		if (!enabledRef.current) return;

		try {
			const { currentTime, duration, playbackRate } =
				getPlaybackStateRef.current();

			const elapsedSinceLastSync = Math.floor(
				(Date.now() - lastSyncRef.current) / 1000,
			);
			const progress = duration > 0 ? currentTime / duration : 0;
			const newStatus =
				progress >= COMPLETION_THRESHOLD ? "completed" : "listening";

			await client.listeningProgress.saveProgress({
				bookUuid: bookUuidRef.current,
				currentTimeSeconds: currentTime,
				durationSeconds: duration,
				playbackRate,
				listeningTimeSeconds: elapsedSinceLastSync,
				status: newStatus,
			});

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
		() => enqueue(performSync),
		[enqueue, performSync],
	);

	syncRef.current = syncProgress;

	// visibilitychange fires reliably before page unload in modern browsers
	useDocumentEvent("visibilitychange", () => {
		if (document.visibilityState === "hidden") {
			syncRef.current?.();
		}
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
				await client.presence
					.clearActivity({ context: { keepalive: true } })
					.catch(() => {});
			});
		}
	}, [bookUuid, enabled, enqueue]);

	// Sync on unmount, then clear "listening" presence (see the hook for the
	// sync-before-clear ordering).
	useClearActivityOnUnmount(async () => {
		if (enabledRef.current) await syncRef.current?.();
	});

	return { syncNow: syncProgress };
}
