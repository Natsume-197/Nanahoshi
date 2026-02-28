import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";

interface UseReaderSyncOptions {
	bookUuid: string;
	ttuBookId: number | null;
	enabled: boolean;
}

interface ReaderSyncState {
	exploredCharCount: number;
	bookCharCount: number;
	readingTimeSeconds: number;
	status: "unread" | "reading" | "completed";
}

const SYNC_INTERVAL_MS = 60_000;
const INITIAL_SYNC_DELAY_MS = 5_000;
const COMPLETION_THRESHOLD = 0.9;

export function useReaderSync({
	bookUuid,
	ttuBookId,
	enabled,
}: UseReaderSyncOptions) {
	const [state, setState] = useState<ReaderSyncState>({
		exploredCharCount: 0,
		bookCharCount: 0,
		readingTimeSeconds: 0,
		status: "reading",
	});

	const lastSyncRef = useRef(Date.now());
	const isVisibleRef = useRef(true);
	const syncRef = useRef<(() => Promise<void>) | undefined>(undefined);

	const syncProgress = useCallback(async () => {
		if (!enabled || ttuBookId === null) return;

		try {
			const exploredCharCount =
				(await readTtuStore("bookmark", ttuBookId, "exploredCharCount")) ??
				state.exploredCharCount;
			const bookCharCount =
				(await readTtuStore("data", ttuBookId, "characters")) ??
				state.bookCharCount;

			const elapsedSinceLastSync = Math.floor(
				(Date.now() - lastSyncRef.current) / 1000,
			);
			const progress =
				bookCharCount > 0 ? exploredCharCount / bookCharCount : 0;
			const newStatus =
				progress >= COMPLETION_THRESHOLD ? "completed" : "reading";

			setState((prev) => ({
				...prev,
				exploredCharCount,
				bookCharCount,
				readingTimeSeconds: prev.readingTimeSeconds + elapsedSinceLastSync,
				status: newStatus,
			}));

			await client.readingProgress.saveProgress({
				bookUuid,
				ttuBookId,
				exploredCharCount,
				bookCharCount,
				readingTimeSeconds: elapsedSinceLastSync,
				status: newStatus,
			});

			lastSyncRef.current = Date.now();
		} catch (err) {
			console.error("Failed to sync reading progress:", err);
		}
	}, [
		bookUuid,
		ttuBookId,
		enabled,
		state.exploredCharCount,
		state.bookCharCount,
	]);

	syncRef.current = syncProgress;

	// Reading timer — pauses when tab is hidden, syncs when leaving
	useEffect(() => {
		if (!enabled) return;

		const handleVisibilityChange = () => {
			isVisibleRef.current = document.visibilityState === "visible";
			if (document.visibilityState === "hidden") {
				syncRef.current?.();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		const timer = setInterval(() => {
			if (isVisibleRef.current) {
				setState((prev) => ({
					...prev,
					readingTimeSeconds: prev.readingTimeSeconds + 1,
				}));
			}
		}, 1000);

		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [enabled]);

	// Initial sync (after TTU populates IndexedDB) + periodic sync
	useEffect(() => {
		if (!enabled || ttuBookId === null) return;

		const initialTimeout = setTimeout(
			() => syncRef.current?.(),
			INITIAL_SYNC_DELAY_MS,
		);
		const interval = setInterval(() => syncRef.current?.(), SYNC_INTERVAL_MS);

		return () => {
			clearTimeout(initialTimeout);
			clearInterval(interval);
		};
	}, [enabled, ttuBookId]);

	// Sync on unmount and page close
	useEffect(() => {
		if (!enabled || ttuBookId === null) return;

		const handleBeforeUnload = () => syncRef.current?.();
		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			syncRef.current?.();
		};
	}, [enabled, ttuBookId]);

	return {
		...state,
		syncNow: syncProgress,
		formattedTime: formatTime(state.readingTimeSeconds),
	};
}

function formatTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0)
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Read a field from TTU's IndexedDB. The iframe is same-origin (proxied via Vite)
 * so we can access the "books" database directly.
 */
function readTtuStore(
	storeName: string,
	key: number,
	field: string,
): Promise<number | null> {
	return new Promise((resolve) => {
		try {
			const request = indexedDB.open("books", 6);
			request.onerror = () => resolve(null);
			request.onsuccess = () => {
				const db = request.result;
				try {
					const tx = db.transaction(storeName, "readonly");
					const getReq = tx.objectStore(storeName).get(key);
					getReq.onsuccess = () => resolve(getReq.result?.[field] ?? null);
					getReq.onerror = () => resolve(null);
				} catch {
					resolve(null);
				}
			};
		} catch {
			resolve(null);
		}
	});
}
