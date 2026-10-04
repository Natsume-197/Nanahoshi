import { useCan } from "@/lib/abilities";
import { haptics } from "@/lib/haptics";
import { usePlayer } from "@/player/provider";
import { canDownloadTitle, type DownloadKind } from "./model";
import {
	useActiveServerId,
	useDownloads,
	useIsOnline,
	useTitleDownload,
} from "./provider";

/** Download, cancel and remove for one title, shared by its download button,
 * its long-press menu and the Downloads page. */
export function useDownloadActions(
	kind: DownloadKind,
	uuid: string,
	_title: string | null,
) {
	const downloads = useDownloads();
	const player = usePlayer();
	const can = useCan();
	const serverId = useActiveServerId();
	const status = useTitleDownload(kind, uuid);
	// Offline a download can't start; removing or cancelling still can.
	const online = useIsOnline();

	const start = () => {
		if (!serverId) return;
		haptics.tap();
		downloads.download(kind, uuid, serverId);
	};
	// No confirmations: each is one tap to undo, and the state shows at once.
	const cancel = () => {
		haptics.select();
		downloads.cancel(uuid);
	};
	const remove = async () => {
		haptics.select();
		// Its files are about to go from under the player.
		if (player.getSnapshot().book?.uuid === uuid) await player.stop();
		if (serverId) downloads.remove(kind, serverId, uuid);
	};

	return {
		status,
		allowed: online && canDownloadTitle(kind, can),
		start,
		cancel,
		remove,
	};
}
