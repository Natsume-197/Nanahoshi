import { Button } from "@nanahoshi/ui/components/button";
import { Separator } from "@nanahoshi/ui/components/separator";
import { Slider } from "@nanahoshi/ui/components/slider";
import { cn } from "@nanahoshi/ui/lib/utils";
import { ArrowCounterClockwise, Minus, Plus } from "@phosphor-icons/react";
import { memo } from "react";
import { PlayerSheetButton } from "@/components/audio-player/player-controls";
import { JumpSettings } from "@/components/audio-player/player-jump-settings";
import {
	clampSpeed,
	formatSpeed,
	MAX_SPEED,
	MIN_SPEED,
	nudgeSpeed,
	SPEED_PRESETS,
} from "@/components/audio-player/player-preferences";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";

/** Where the sheet's slider stops: past 3× is presets-and-buttons territory. */
const SLIDER_MAX = 3;

export const SpeedSettings = memo(function SpeedSettings({
	touch = false,
}: {
	/** Finger-sized controls and a slider, for the phone sheet. */
	touch?: boolean;
}) {
	const { speed, defaultSpeed, speedIsOverride } = useAudioPlayerState();
	const { setSpeed, useDefaultSpeed } = useAudioPlayerActions();
	const stepClass = touch ? "size-11" : "size-8";
	const rowClass = touch ? "h-11 text-sm" : "h-7 text-xs";

	return (
		<div className={cn("flex flex-col", touch ? "gap-4" : "gap-2")}>
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
					className={stepClass}
				>
					<Minus className="size-4" />
				</Button>
				<span
					className={cn(
						"flex-1 text-center font-mono font-semibold tabular-nums",
						touch ? "text-3xl" : "text-lg",
					)}
				>
					{formatSpeed(speed)}
				</span>
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label={m["audiobook.player_speed_faster"]()}
					disabled={speed >= MAX_SPEED}
					onClick={() => setSpeed(nudgeSpeed(speed, 1))}
					className={stepClass}
				>
					<Plus className="size-4" />
				</Button>
			</div>
			{touch && (
				<Slider
					min={MIN_SPEED}
					max={SLIDER_MAX}
					step={0.05}
					value={[Math.min(speed, SLIDER_MAX)]}
					onValueChange={([value]) => {
						if (value != null) setSpeed(clampSpeed(value));
					}}
					aria-label={m["audiobook.player_speed_title"]()}
					data-sheet-ignore
					className="py-3"
				/>
			)}
			<div className="grid grid-cols-3 gap-1.5">
				{SPEED_PRESETS.map((preset) => (
					<Button
						key={preset}
						type="button"
						variant={clampSpeed(preset) === speed ? "default" : "outline"}
						size="sm"
						onClick={() => setSpeed(preset)}
						className={cn("px-0 font-mono", rowClass)}
					>
						{formatSpeed(preset)}
					</Button>
				))}
			</div>
			{speedIsOverride ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={useDefaultSpeed}
					className={cn("gap-1.5 text-muted-foreground", rowClass)}
				>
					<ArrowCounterClockwise className="size-3.5" />
					{m["audiobook.player_speed_use_default"]({
						speed: formatSpeed(defaultSpeed),
					})}
				</Button>
			) : (
				speed !== 1 && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setSpeed(1)}
						className={cn("gap-1.5 text-muted-foreground", rowClass)}
					>
						<ArrowCounterClockwise className="size-3.5" />
						{m["audiobook.player_speed_reset"]()}
					</Button>
				)
			)}
		</div>
	);
});

/**
 * Speed, plus the jump amounts: both shape how the transport moves through
 * the book, and the jumps no longer crowd the overflow menu.
 */
export const SpeedButton = memo(function SpeedButton() {
	const { speed, speedIsOverride } = useAudioPlayerState();

	return (
		<PlayerSheetButton
			label={m["audiobook.player_speed"]()}
			title={m["audiobook.player_playback_title"]()}
			align="start"
			contentClassName="w-64 gap-3"
			className="h-11 w-auto min-w-16 rounded-full px-4 font-mono text-base text-foreground tabular-nums"
			trigger={
				<span className="relative inline-flex items-center">
					{formatSpeed(speed)}
					{speedIsOverride && (
						<span
							aria-hidden
							className="absolute -top-0.5 -right-2 size-1.5 rounded-full bg-primary"
						/>
					)}
				</span>
			}
		>
			{(touch) => (
				<>
					<SpeedSettings touch={touch} />
					<Separator />
					<JumpSettings touch={touch} />
				</>
			)}
		</PlayerSheetButton>
	);
});
