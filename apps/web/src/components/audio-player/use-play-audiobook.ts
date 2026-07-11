import { useCallback } from "react";
import { toast } from "sonner";
import {
	toPlayerData,
	useAudioPlayerActions,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";

/**
 * Start playback of an audiobook by uuid without leaving the current page — the
 * mini player picks it up. Reuses any cached detail payload from the catalog/
 * detail pages, so a warm click loads synchronously.
 */
export function usePlayAudiobook() {
	const { loadAudiobook, signalPlayIntent } = useAudioPlayerActions();

	return useCallback(
		async (uuid: string) => {
			// Show the clicked button's spinner right away — before the details fetch
			// resolves — then loadAudiobook carries the loading state to `canplay`.
			signalPlayIntent(uuid);
			try {
				// Progress rides alongside the details fetch instead of serializing a
				// second round trip before play(). Always fetched fresh (not from the
				// query cache): a stale position would rewind the book.
				const [details, progress] = await Promise.all([
					queryClient.ensureQueryData(
						orpc.audiobooks.getDetails.queryOptions({ input: { uuid } }),
					),
					client.listeningProgress
						.getProgress({ bookUuid: uuid })
						.catch(() => null),
				]);
				if (!details) {
					signalPlayIntent(null);
					return;
				}
				loadAudiobook(toPlayerData(details), {
					startTime: progress?.currentTimeSeconds ?? 0,
				});
			} catch {
				signalPlayIntent(null);
				toast.error(m["toast.playback_failed"]());
			}
		},
		[loadAudiobook, signalPlayIntent],
	);
}

/**
 * Warm the details cache on hover/focus intent so a subsequent play click (or
 * detail navigation) skips the getDetails round trip.
 */
export function usePrefetchAudiobook() {
	return useCallback((uuid: string) => {
		queryClient.prefetchQuery(
			orpc.audiobooks.getDetails.queryOptions({ input: { uuid } }),
		);
	}, []);
}
