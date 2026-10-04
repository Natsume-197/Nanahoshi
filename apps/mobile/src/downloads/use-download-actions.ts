import * as Haptics from "expo-haptics";
import { useCan } from "@/lib/abilities";
import { usePlayer } from "@/player/provider";
import { canDownloadTitle, type DownloadKind } from "./model";
import { useActiveServerId, useDownloads, useTitleDownload } from "./provider";

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

	const start = () => {
		if (!serverId) return;
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		downloads.download(kind, uuid, serverId);
	};
	// No confirmations: each is one tap to undo, and the state shows at once.
	const cancel = () => {
		void Haptics.selectionAsync();
		downloads.cancel(uuid);
	};
	const remove = async () => {
		void Haptics.selectionAsync();
		// Its files are about to go from under the player.
		if (player.getSnapshot().book?.uuid === uuid) await player.stop();
		if (serverId) downloads.remove(kind, serverId, uuid);
	};

	return {
		status,
		allowed: canDownloadTitle(kind, can),
		start,
		cancel,
		remove,
	};
}
