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

	const timerRef = useRef(0);
	const lastSyncRef = useRef(Date.now());
	const isVisibleRef = useRef(true);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const syncProgress = useCallback(async () => {
		if (!enabled || ttuBookId === null) return;

		try {
			const bookmark = await readTtuBookmark(ttuBookId);
			const elapsedSinceLastSync = Math.floor(
				(Date.now() - lastSyncRef.current) / 1000,
			);

			const exploredCharCount =
				bookmark?.exploredCharCount ?? state.exploredCharCount;
			const bookCharCount = bookmark?.characters ?? state.bookCharCount;
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

	// Reading timer — pauses when tab is hidden
	useEffect(() => {
		if (!enabled) return;

		const handleVisibilityChange = () => {
			isVisibleRef.current = document.visibilityState === "visible";
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		const timer = setInterval(() => {
			if (isVisibleRef.current) {
				timerRef.current += 1;
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

	// Periodic sync
	useEffect(() => {
		if (!enabled || ttuBookId === null) return;

		intervalRef.current = setInterval(syncProgress, SYNC_INTERVAL_MS);

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [enabled, ttuBookId, syncProgress]);

	// Sync on unmount
	useEffect(() => {
		return () => {
			if (enabled && ttuBookId !== null) {
				syncProgress();
			}
		};
	}, [enabled, ttuBookId, syncProgress]);

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

async function readTtuBookmark(
	ttuBookId: number,
): Promise<{ exploredCharCount: number; characters: number } | null> {
	return new Promise((resolve) => {
		try {
			const request = indexedDB.open("books", 6);
			request.onsuccess = () => {
				const db = request.result;
				try {
					const tx = db.transaction("bookmark", "readonly");
					const store = tx.objectStore("bookmark");
					const getReq = store.get(ttuBookId);
					getReq.onsuccess = () => {
						const bookmark = getReq.result;
						if (bookmark) {
							resolve({
								exploredCharCount: bookmark.exploredCharCount ?? 0,
								characters: bookmark.characters ?? 0,
							});
						} else {
							resolve(null);
						}
					};
					getReq.onerror = () => resolve(null);
				} catch {
					resolve(null);
				}
			};
			request.onerror = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
}
