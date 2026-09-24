import { createElement, useCallback, useRef } from "react";
import { useClearActivityOnUnmount } from "@/hooks/use-clear-activity-on-unmount";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useInterval } from "@/hooks/use-interval";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import {
	invalidateListeningProgress,
	invalidateRecommendations,
} from "@/lib/invalidate-progress";
import { client } from "@/utils/orpc";

interface UsePlayerSyncOptions {
	bookUuid: string;
	/** The loaded book has a trustworthy position that may be persisted. */
	enabled: boolean;
	/** Playback is currently active. Defaults to `enabled` for older callers. */
	active?: boolean;
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
	active = enabled,
	getPlaybackState,
}: UsePlayerSyncOptions) {
	// Start of playback not yet counted; null while nothing is playing.
	const lastSyncRef = useRef<number | null>(null);
	const syncRef = useRef<(() => Promise<void>) | undefined>(undefined);
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;
	const activeRef = useRef(active);
	activeRef.current = active;
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

			const now = Date.now();
			const elapsedSinceLastSync =
				lastSyncRef.current === null
					? 0
					: Math.floor((now - lastSyncRef.current) / 1000);
			// A pause must not count as listening once playback resumes.
			lastSyncRef.current = activeRef.current
				? now - ((now - (lastSyncRef.current ?? now)) % 1000)
				: null;
			const progress = duration > 0 ? currentTime / duration : 0;
			const newStatus =
				progress >= COMPLETION_THRESHOLD ? "completed" : "listening";

			await client.listeningProgress.saveProgress(
				{
					bookUuid: bookUuidRef.current,
					currentTimeSeconds: currentTime,
					durationSeconds: duration,
					playbackRate,
					listeningTimeSeconds: elapsedSinceLastSync,
					status: newStatus,
				},
				// Let a final save survive tab close/mobile app suspension.
				{ context: { keepalive: true } },
			);

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
	useWindowEvent("beforeunload", () => {
		if (enabledRef.current) syncRef.current?.();
	});
	useWindowEvent("pagehide", () => {
		if (enabledRef.current) syncRef.current?.();
	});

	useInterval(() => {
		if (activeRef.current) {
			syncRef.current?.();
		}
	}, SYNC_INTERVAL_MS);

	const previousSessionRef = useRef({ active: false, bookUuid: "" });
	const binding = createElement(PlayerSyncTransition, {
		key: `${bookUuid}:${active}`,
		transition: () => {
			const previous = previousSessionRef.current;
			const started =
				active && (!previous.active || previous.bookUuid !== bookUuid);
			const stopped = previous.active && !active;
			previousSessionRef.current = { active, bookUuid };

			if (started) {
				lastSyncRef.current = Date.now();
				syncRef.current?.();
			}
			if (stopped) {
				enqueue(async () => {
					// Persist while the media element still holds the final paused
					// playhead, before removing the live listening activity.
					await performSync();
					await client.presence
						.clearActivity({ context: { keepalive: true } })
						.catch(() => {});
				});
			}
		},
	});

	// Sync on unmount, then clear "listening" presence (see the hook for the
	// sync-before-clear ordering).
	useClearActivityOnUnmount(async () => {
		if (enabledRef.current) await syncRef.current?.();
	});

	return { syncNow: syncProgress, binding };
}

function PlayerSyncTransition({ transition }: { transition: () => void }) {
	useMountEffect(transition);
	return null;
}
