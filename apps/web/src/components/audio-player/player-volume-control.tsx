import { SpeakerHigh, SpeakerLow, SpeakerX } from "@phosphor-icons/react";
import { Slider as SliderPrimitive } from "radix-ui";
import { memo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";

/**
 * Volume trigger button that opens a vertical slider popover. Keeps the player
 * bar narrow — the slider only appears on demand. Reads/writes the shared audio
 * context so it behaves identically in the mini and expanded players.
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
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Volume"
					className={cn("size-8 text-muted-foreground", className)}
				>
					<VolumeIcon className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="center"
				sideOffset={8}
				className="flex w-auto flex-col items-center gap-2 rounded-xl p-3"
			>
				<span className="text-[11px] text-muted-foreground tabular-nums">
					{Math.round((isMuted ? 0 : volume) * 100)}
				</span>
				<SliderPrimitive.Root
					min={0}
					max={1}
					step={0.01}
					orientation="vertical"
					value={[isMuted ? 0 : volume]}
					onValueChange={([val]) => setVolume(val ?? 0)}
					aria-label="Volume"
					className="relative flex h-28 w-4 cursor-pointer touch-none select-none flex-col items-center justify-center"
				>
					<SliderPrimitive.Track className="relative h-full w-1 grow overflow-hidden rounded-full bg-foreground/20">
						<SliderPrimitive.Range className="absolute w-full rounded-full bg-foreground" />
					</SliderPrimitive.Track>
					<SliderPrimitive.Thumb className="block size-3 rounded-full bg-foreground shadow transition-transform hover:scale-110 focus-visible:outline-hidden" />
				</SliderPrimitive.Root>
				<Button
					variant="ghost"
					size="icon"
					aria-label={isMuted ? "Unmute" : "Mute"}
					onClick={toggleMute}
					className="size-7 text-muted-foreground"
				>
					{isMuted ? (
						<SpeakerX className="size-4" />
					) : (
						<SpeakerHigh className="size-4" />
					)}
				</Button>
			</PopoverContent>
		</Popover>
	);
});
