import { useAudiobookPlaybackStatus } from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";

const BAR_DELAYS = ["0ms", "-300ms", "-600ms"];

/**
 * Resume-card meta line that leads with a Spotify-style equalizer while the
 * card's audiobook is the one loaded in the player (frozen when paused).
 */
export function NowPlayingMeta({
	uuid,
	children,
}: {
	uuid: string;
	children: string;
}) {
	const status = useAudiobookPlaybackStatus(uuid);
	if (!status) return children;
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				aria-hidden
				className="inline-flex h-2.5 shrink-0 items-end gap-0.5"
			>
				{BAR_DELAYS.map((delay) => (
					<span
						key={delay}
						className="now-playing-bar"
						data-playing={status === "playing" ? "" : undefined}
						style={{ animationDelay: delay }}
					/>
				))}
			</span>
			<span className="sr-only">{m["audiobook.player_now_playing"]()}:</span>
			{children}
		</span>
	);
}
