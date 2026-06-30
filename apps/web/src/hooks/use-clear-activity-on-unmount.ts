import { useOnUnmount } from "@/hooks/use-on-unmount";
import { client } from "@/utils/orpc";

/**
 * On unmount, run the final progress sync, then clear "reading"/"listening"
 * presence so friends see the user drop back to plain online right away (the
 * activity TTL is only the fallback). Clearing must wait for the final sync to
 * resolve: that sync re-marks the activity on the server, so clearing first
 * would lose the race and leave the user stuck. Shared by the reader and the
 * audio player, whose sync hooks otherwise carry this same race-sensitive glue.
 */
export function useClearActivityOnUnmount(runFinalSync: () => unknown) {
	useOnUnmount(() => {
		Promise.resolve(runFinalSync()).finally(() => {
			client.follow
				.clearActivity({ context: { keepalive: true } })
				.catch(() => {});
		});
	});
}
