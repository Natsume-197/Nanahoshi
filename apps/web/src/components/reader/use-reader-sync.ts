import { useCallback, useRef } from "react";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useInterval } from "@/hooks/use-interval";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { useWindowEvent } from "@/hooks/use-window-event";
import { markPendingProgress } from "@/lib/reader/pending-progress";
import { claimReadingTimeSlice } from "@/lib/reader/reading-time-slice";
import { client } from "@/utils/orpc";

interface UseReaderSyncOptions {
	bookUuid: string;
	enabled: boolean;
	/** exploredCharCount undefined = no bookmark yet; the count is omitted
	 * from the sync so existing server progress is never wiped. */
	getCharCounts: () => {
		exploredCharCount: number | undefined;
		bookCharCount: number;
	};
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
	const syncRef = useRef<(() => Promise<void>) | undefined>(undefined);

	const syncProgress = useCallback(async () => {
		if (!enabled) return;

		const { exploredCharCount, bookCharCount } = getCharCounts();

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
			// switch, tab close) survive on mobile.
			await client.readingProgress.saveProgress(
				{
					bookUuid,
					...(exploredCharCount !== undefined && { exploredCharCount }),
					bookCharCount,
					readingTimeSeconds: elapsedSinceLastSync,
					status: newStatus,
				},
				{ context: { keepalive: true } },
			);
		} catch (err) {
			console.error("Failed to sync reading progress:", err);
			// The slice was already claimed above; queue it so it lives in exactly
			// one place (the offline queue) until a later flush delivers it.
			markPendingProgress({
				bookUuid,
				...(exploredCharCount !== undefined && { exploredCharCount }),
				bookCharCount,
				readingTimeSeconds: elapsedSinceLastSync,
				status: newStatus,
			});
		}
	}, [bookUuid, enabled, getCharCounts]);

	syncRef.current = syncProgress;

	// Sync progress when the tab is hidden (also covers mobile app switches)
	useDocumentEvent("visibilitychange", () => {
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

	// Initial delayed sync (marks the book as "reading")
	useMountEffect(() => {
		const initialTimeout = setTimeout(() => {
			syncRef.current?.();
		}, INITIAL_SYNC_DELAY_MS);
		return () => clearTimeout(initialTimeout);
	});

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

	// Sync on unmount
	useOnUnmount(() => {
		if (enabled) {
			syncRef.current?.();
		}
	});

	return { syncNow: syncProgress };
}
