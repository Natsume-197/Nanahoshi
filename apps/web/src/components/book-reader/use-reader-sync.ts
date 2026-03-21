import { useCallback, useRef } from "react";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useInterval } from "@/hooks/use-interval";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { useWindowEvent } from "@/hooks/use-window-event";
import { client } from "@/utils/orpc";

interface UseReaderSyncOptions {
	bookUuid: string;
	enabled: boolean;
	getCharCounts: () => { exploredCharCount: number; bookCharCount: number };
}

const SYNC_INTERVAL_MS = 60_000;
const INITIAL_SYNC_DELAY_MS = 5_000;
const COMPLETION_THRESHOLD = 0.9;

export function useReaderSync({
	bookUuid,
	enabled,
	getCharCounts,
}: UseReaderSyncOptions) {
	const lastSyncRef = useRef(Date.now());
	const isVisibleRef = useRef(true);
	const syncRef = useRef<(() => Promise<void>) | undefined>(undefined);

	const syncProgress = useCallback(async () => {
		if (!enabled) return;

		try {
			const { exploredCharCount, bookCharCount } = getCharCounts();

			const elapsedSinceLastSync = Math.floor(
				(Date.now() - lastSyncRef.current) / 1000,
			);
			const progress =
				bookCharCount > 0 ? exploredCharCount / bookCharCount : 0;
			const newStatus =
				progress >= COMPLETION_THRESHOLD ? "completed" : "reading";

			await client.readingProgress.saveProgress({
				bookUuid,
				exploredCharCount,
				bookCharCount,
				readingTimeSeconds: elapsedSinceLastSync,
				status: newStatus,
			});

			lastSyncRef.current = Date.now();
		} catch (err) {
			console.error("Failed to sync reading progress:", err);
		}
	}, [bookUuid, enabled, getCharCounts]);

	syncRef.current = syncProgress;

	// Pause tracking when tab hidden, sync progress when leaving
	useDocumentEvent("visibilitychange", () => {
		isVisibleRef.current = document.visibilityState === "visible";
		if (document.visibilityState === "hidden") {
			syncRef.current?.();
		}
	});

	// Periodic sync
	useInterval(() => {
		if (enabled) {
			syncRef.current?.();
		}
	}, SYNC_INTERVAL_MS);

	// Initial delayed sync
	useMountEffect(() => {
		const initialTimeout = setTimeout(() => {
			syncRef.current?.();
		}, INITIAL_SYNC_DELAY_MS);
		return () => clearTimeout(initialTimeout);
	});

	// Sync on page close
	useWindowEvent("beforeunload", () => {
		if (enabled) {
			syncRef.current?.();
		}
	});

	// Sync on unmount
	useOnUnmount(() => {
		if (enabled) {
			syncRef.current?.();
		}
	});

	return { syncNow: syncProgress };
}
