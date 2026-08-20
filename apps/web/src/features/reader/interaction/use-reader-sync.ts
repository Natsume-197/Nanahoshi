import { useCallback, useEffect, useRef } from "react";
import { claimReadingTimeSlice } from "@/features/reader/renderers/shared/reading-time-slice";
import { markPendingProgress } from "@/features/reader/session/pending-progress";
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
	bookUuid: string;
	enabled: boolean;
	/** exploredCharCount undefined = the reader has not reported a position yet;
	 * the count is then omitted so existing server progress is never wiped. */
	getCharCounts: () => {
		exploredCharCount: number | undefined;
		bookCharCount: number;
		positionIntentAt: number | undefined;
	};
}

const SYNC_INTERVAL_MS = 60_000;
const COMPLETION_THRESHOLD = 0.9;

export function useReaderSync({
	bookUuid,
	enabled,
	getCharCounts,
}: UseReaderSyncOptions) {
	const lastSyncRef = useRef(Date.now());
	const syncRef = useRef<(() => Promise<void>) | undefined>(undefined);
	const lastPositionSnapshotRef = useRef<string | undefined>(undefined);

	const syncProgress = useCallback(async () => {
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
		if (positionSnapshot) lastPositionSnapshotRef.current = positionSnapshot;

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
		const syncOperationId = globalThis.crypto.randomUUID();

		try {
			// keepalive so syncs fired while the page is hiding/freezing (app
			// switch, tab close) start immediately and survive on mobile. The server
			// rejects an older intent if responses arrive out of order.
			await client.readingProgress.saveProgress(
				{
					bookUuid,
					syncOperationId,
					...positionWrite,
					bookCharCount,
					readingTimeSeconds: elapsedSinceLastSync,
					status: newStatus,
				},
				{ context: { keepalive: true } },
			);
			invalidateReadingProgress();
		} catch (err) {
			console.error("Failed to sync reading progress:", err);
			// The slice was already claimed above; queue it so it lives in exactly
			// one place (the offline queue) until a later flush delivers it.
			markPendingProgress({
				bookUuid,
				syncOperationId,
				...positionWrite,
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

	const wasEnabledRef = useRef(false);
	useEffect(() => {
		const started = enabled && !wasEnabledRef.current;
		wasEnabledRef.current = enabled;
		if (started) syncRef.current?.();
	}, [enabled]);

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
