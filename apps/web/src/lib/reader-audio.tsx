import type { ReadListenAudio } from "@nanahoshi/reader/read-listen/audio";
import { PlayerHostReadListenBridge } from "@/components/audio-player/player-host";
import {
	toPlayerData,
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";

/** Read & Listen on the web plays through the app's HTML audio player. */
export const webReadListenAudio: ReadListenAudio = {
	useState: () => {
		const player = useAudioPlayerState();
		return {
			audiobookUuid: player.audiobook?.uuid ?? null,
			isPlaying: player.isPlaying,
			playbackRate: player.speed,
			globalCurrentTime: player.globalCurrentTime,
		};
	},
	useActions: () => {
		const actions = useAudioPlayerActions();
		return {
			load: (audiobook) =>
				actions.loadAudiobook(toPlayerData(audiobook), { autoplay: false }),
			release: () => actions.setExpanded(false),
			play: actions.play,
			pause: actions.pause,
			seekTo: actions.seekTo,
			getGlobalCurrentTime: actions.getGlobalCurrentTime,
		};
	},
	Controls: PlayerHostReadListenBridge,
};
