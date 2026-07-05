import { useCallback } from "react";
import { toast } from "sonner";
import {
	toPlayerData,
	useAudioPlayerActions,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

/**
 * Start playback of an audiobook by uuid without leaving the current page — the
 * mini player picks it up. Reuses any cached detail payload from the catalog/
 * detail pages, so a warm click loads synchronously.
 */
export function usePlayAudiobook() {
	const { loadAudiobook } = useAudioPlayerActions();

	return useCallback(
		async (uuid: string) => {
			try {
				const details = await queryClient.ensureQueryData(
					orpc.audiobooks.getDetails.queryOptions({ input: { uuid } }),
				);
				if (!details) return;
				loadAudiobook(toPlayerData(details));
			} catch {
				toast.error(m["toast.playback_failed"]());
			}
		},
		[loadAudiobook],
	);
}
