import { useCallback, useRef } from "react";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useInterval } from "@/hooks/use-interval";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { client } from "@/utils/orpc";

interface UsePlayerSyncOptions {
	bookUuid: string;
	enabled: boolean;
	getPlaybackState: () => {
		currentTime: number;
		duration: number;
	};
}

const SYNC_INTERVAL_MS = 60_000;
const INITIAL_SYNC_DELAY_MS = 5_000;
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
	bookUuidRef.current = bookUuid;
	const getPlaybackStateRef = useRef(getPlaybackState);
	getPlaybackStateRef.current = getPlaybackState;

	const syncProgress = useCallback(async () => {
		if (!enabledRef.current) return;

		try {
			const { currentTime, duration } = getPlaybackStateRef.current();

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
				listeningTimeSeconds: elapsedSinceLastSync,
				status: newStatus,
			});

			lastSyncRef.current = Date.now();
		} catch (err) {
			console.error("Failed to sync listening progress:", err);
		}
	}, []);

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

	useMountEffect(() => {
		const initialTimeout = setTimeout(() => {
			syncRef.current?.();
		}, INITIAL_SYNC_DELAY_MS);
		return () => clearTimeout(initialTimeout);
	});

	useOnUnmount(() => {
		if (enabledRef.current) {
			syncRef.current?.();
		}
	});

	return { syncNow: syncProgress };
}
