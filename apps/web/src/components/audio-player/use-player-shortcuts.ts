import { useRef } from "react";
import {
	resolvePlayerShortcut,
	type ShortcutEvent,
	VOLUME_STEP,
} from "@/components/audio-player/player-shortcuts";
import {
	useAudioPlayerActions,
	useAudioPlayerExpanded,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { useWindowEvent } from "@/hooks/use-window-event";

/**
 * Space to play, arrows to jump, shift+arrows for chapters, up/down for volume,
 * `m` to mute, `f` to expand, Escape to collapse.
 */
export function usePlayerShortcuts() {
	const { audiobook, volume, jumpBack, jumpForward } = useAudioPlayerState();
	const isExpanded = useAudioPlayerExpanded();
	const { togglePlay, seekRelative, skipChapter, setVolume, setExpanded } =
		useAudioPlayerActions();

	const lastVolumeRef = useRef(volume > 0 ? volume : 1);
	if (volume > 0) lastVolumeRef.current = volume;

	useWindowEvent("keydown", (event) => {
		if (!audiobook) return;
		const shortcut = resolvePlayerShortcut(
			{
				key: event.key,
				defaultPrevented: event.defaultPrevented,
				shiftKey: event.shiftKey,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				altKey: event.altKey,
				target: event.target as ShortcutEvent["target"],
			},
			{ isExpanded },
		);
		if (!shortcut) return;
		// Only after a match: Space must still scroll the page otherwise.
		event.preventDefault();

		switch (shortcut) {
			case "toggle-play":
				togglePlay();
				break;
			case "seek-back":
				seekRelative(-jumpBack);
				break;
			case "seek-forward":
				seekRelative(jumpForward);
				break;
			case "prev-chapter":
				skipChapter(-1);
				break;
			case "next-chapter":
				skipChapter(1);
				break;
			case "volume-up":
				setVolume(volume + VOLUME_STEP);
				break;
			case "volume-down":
				setVolume(volume - VOLUME_STEP);
				break;
			case "toggle-mute":
				setVolume(volume === 0 ? lastVolumeRef.current : 0);
				break;
			case "toggle-expanded":
				setExpanded(!isExpanded);
				break;
			case "collapse":
				setExpanded(false);
				break;
		}
	});
}
