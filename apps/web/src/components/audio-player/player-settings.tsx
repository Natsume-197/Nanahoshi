import { GearSix, Moon } from "@phosphor-icons/react";
import { memo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { useInterval } from "@/hooks/use-interval";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatTime } from "@/utils/format";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const SLEEP_OPTIONS = [5, 15, 30, 45, 60] as const;

/**
 * Gear popover grouping secondary playback settings (speed + sleep timer) so the
 * compact player bar doesn't grow with each new option. Reads/writes the shared
 * audio context.
 */
export const PlayerSettings = memo(function PlayerSettings({
	className,
	align = "end",
}: {
	className?: string;
	align?: "start" | "center" | "end";
}) {
	const { speed } = useAudioPlayerState();
	const { setSpeed, pause } = useAudioPlayerActions();

	// Sleep timer: pauses playback after the chosen number of minutes.
	const [sleep, setSleep] = useState<{
		totalMin: number;
		remaining: number;
	} | null>(null);
	const pauseRef = useRef(pause);
	pauseRef.current = pause;
	useInterval(() => {
		setSleep((prev) => {
			if (prev == null) return null;
			if (prev.remaining <= 1) {
				pauseRef.current();
				return null;
			}
			return { ...prev, remaining: prev.remaining - 1 };
		});
	}, 1000);

	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label={m["audiobook.player_settings"]()}
							className={cn("size-8 text-muted-foreground", className)}
						>
							<GearSix className="size-4" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={8}>
					{m["audiobook.player_settings"]()}
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				side="top"
				align={align}
				sideOffset={8}
				className="w-60 gap-4 rounded-xl p-3"
			>
				{/* Playback speed */}
				<div className="flex flex-col gap-1.5">
					<p className="font-medium text-xs">Playback speed</p>
					<div className="grid grid-cols-4 gap-1">
						{SPEED_OPTIONS.map((opt) => (
							<Button
								key={opt}
								type="button"
								variant={opt === speed ? "default" : "outline"}
								size="sm"
								onClick={() => setSpeed(opt)}
								className="h-7 px-0 font-mono text-xs"
							>
								{opt}×
							</Button>
						))}
					</div>
				</div>

				{/* Sleep timer */}
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between">
						<p className="flex items-center gap-1.5 font-medium text-xs">
							<Moon className="size-3.5" />
							Sleep timer
						</p>
						{sleep && (
							<span className="text-[11px] text-primary tabular-nums">
								{formatTime(sleep.remaining)}
							</span>
						)}
					</div>
					<div className="grid grid-cols-5 gap-1">
						{SLEEP_OPTIONS.map((min) => (
							<Button
								key={min}
								type="button"
								variant={sleep?.totalMin === min ? "default" : "outline"}
								size="sm"
								onClick={() => setSleep({ totalMin: min, remaining: min * 60 })}
								className="h-7 px-0 text-xs"
							>
								{min}
							</Button>
						))}
					</div>
					{sleep && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setSleep(null)}
							className="h-7 text-muted-foreground text-xs"
						>
							Cancel timer
						</Button>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
});
