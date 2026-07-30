import { ArrowCounterClockwise, Minus, Plus } from "@phosphor-icons/react";
import { memo } from "react";
import { PlayerPopoverButton } from "@/components/audio-player/player-controls";
import {
	clampSpeed,
	formatSpeed,
	MAX_SPEED,
	MIN_SPEED,
	nudgeSpeed,
	SPEED_PRESETS,
} from "@/components/audio-player/player-preferences";
import { Button } from "@/components/ui/button";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export const SpeedSettings = memo(function SpeedSettings() {
	const { speed } = useAudioPlayerState();
	const { setSpeed } = useAudioPlayerActions();

	return (
		<div className="flex flex-col gap-2">
			<p className="font-medium text-xs">
				{m["audiobook.player_speed_title"]()}
			</p>
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label={m["audiobook.player_speed_slower"]()}
					disabled={speed <= MIN_SPEED}
					onClick={() => setSpeed(nudgeSpeed(speed, -1))}
					className="size-8"
				>
					<Minus className="size-4" />
				</Button>
				<span className="flex-1 text-center font-mono font-semibold text-lg tabular-nums">
					{formatSpeed(speed)}
				</span>
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label={m["audiobook.player_speed_faster"]()}
					disabled={speed >= MAX_SPEED}
					onClick={() => setSpeed(nudgeSpeed(speed, 1))}
					className="size-8"
				>
					<Plus className="size-4" />
				</Button>
			</div>
			<div className="grid grid-cols-3 gap-1">
				{SPEED_PRESETS.map((preset) => (
					<Button
						key={preset}
						type="button"
						variant={clampSpeed(preset) === speed ? "default" : "outline"}
						size="sm"
						onClick={() => setSpeed(preset)}
						className="h-7 px-0 font-mono text-xs"
					>
						{formatSpeed(preset)}
					</Button>
				))}
			</div>
			{speed !== 1 && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setSpeed(1)}
					className="h-7 gap-1.5 text-muted-foreground text-xs"
				>
					<ArrowCounterClockwise className="size-3.5" />
					{m["audiobook.player_speed_reset"]()}
				</Button>
			)}
		</div>
	);
});

export const SpeedButton = memo(function SpeedButton() {
	const { speed } = useAudioPlayerState();

	return (
		<PlayerPopoverButton
			label={m["audiobook.player_speed"]()}
			className={cn(
				"h-9 w-auto min-w-14 rounded-full px-3 font-mono text-sm tabular-nums",
				speed !== 1 && "text-foreground",
			)}
			trigger={formatSpeed(speed)}
		>
			<SpeedSettings />
		</PlayerPopoverButton>
	);
});
