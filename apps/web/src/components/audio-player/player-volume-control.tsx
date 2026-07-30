import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { SpeakerHigh, SpeakerLow, SpeakerX } from "@phosphor-icons/react";
import { memo, useRef } from "react";
import { PlayerPopoverButton } from "@/components/audio-player/player-controls";
import { Button } from "@/components/ui/button";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";

/**
 * Volume trigger button that opens a vertical slider popover. Keeps the player
 * bar narrow — the slider only appears on demand. Reads/writes the shared audio
 * context.
 */
export const PlayerVolumeControl = memo(function PlayerVolumeControl({
	className,
}: {
	className?: string;
}) {
	const { volume } = useAudioPlayerState();
	const { setVolume } = useAudioPlayerActions();

	// Remember the level before muting so the icon toggle can restore it.
	const lastVolumeRef = useRef(volume > 0 ? volume : 1);
	if (volume > 0) lastVolumeRef.current = volume;

	const isMuted = volume === 0;
	const toggleMute = () => setVolume(isMuted ? lastVolumeRef.current : 0);
	const VolumeIcon = isMuted
		? SpeakerX
		: volume < 0.5
			? SpeakerLow
			: SpeakerHigh;

	return (
		<PlayerPopoverButton
			label={m["audiobook.player_volume"]()}
			className={className}
			contentClassName="w-auto items-center gap-2"
			trigger={<VolumeIcon className="size-4" />}
		>
			<span className="text-[11px] text-muted-foreground tabular-nums">
				{Math.round((isMuted ? 0 : volume) * 100)}
			</span>
			<SliderPrimitive.Root
				min={0}
				max={1}
				step={0.01}
				orientation="vertical"
				value={isMuted ? 0 : volume}
				onValueChange={(val) => setVolume(val)}
				aria-label={m["audiobook.player_volume"]()}
				className="relative flex h-28 w-4 cursor-pointer touch-none select-none flex-col items-center justify-center"
			>
				<SliderPrimitive.Control className="relative flex h-full w-4 flex-col items-center">
					<SliderPrimitive.Track className="relative h-full w-1 grow overflow-hidden rounded-full bg-foreground/20">
						<SliderPrimitive.Indicator className="absolute w-full rounded-full bg-foreground" />
					</SliderPrimitive.Track>
					{/* pointer-events-none so a press on the thumb sets the level like
						    any other press instead of only starting a drag. */}
					<SliderPrimitive.Thumb
						index={0}
						className="pointer-events-none block size-3 rounded-full bg-foreground shadow transition-transform focus-visible:outline-hidden"
					/>
				</SliderPrimitive.Control>
			</SliderPrimitive.Root>
			<Button
				variant="ghost"
				size="icon"
				aria-label={
					isMuted
						? m["audiobook.player_unmute"]()
						: m["audiobook.player_mute"]()
				}
				onClick={toggleMute}
				className="size-7 text-muted-foreground"
			>
				{isMuted ? (
					<SpeakerX className="size-4" />
				) : (
					<SpeakerHigh className="size-4" />
				)}
			</Button>
		</PlayerPopoverButton>
	);
});
