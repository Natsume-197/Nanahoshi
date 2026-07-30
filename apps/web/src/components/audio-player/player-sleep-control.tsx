import { Moon } from "@phosphor-icons/react";
import { memo } from "react";
import { PlayerPopoverButton } from "@/components/audio-player/player-controls";
import { SLEEP_DURATIONS } from "@/components/audio-player/sleep-timer";
import { Button } from "@/components/ui/button";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatTime } from "@/utils/format";

export const SleepSettings = memo(function SleepSettings() {
	const { audiobook, sleepTimer } = useAudioPlayerState();
	const { startSleepTimer, extendSleep, cancelSleepTimer } =
		useAudioPlayerActions();

	const hasChapters = (audiobook?.chapters.length ?? 0) > 0;
	const activeMinutes =
		sleepTimer?.mode.kind === "duration" ? sleepTimer.mode.minutes : null;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<p className="flex items-center gap-1.5 font-medium text-xs">
					<Moon className="size-3.5" />
					{m["audiobook.player_sleep"]()}
				</p>
				{sleepTimer && (
					<span className="text-[11px] text-primary tabular-nums">
						{formatTime(sleepTimer.remaining)}
					</span>
				)}
			</div>
			<div className="grid grid-cols-3 gap-1">
				{SLEEP_DURATIONS.map((minutes) => (
					<Button
						key={minutes}
						type="button"
						variant={activeMinutes === minutes ? "default" : "outline"}
						size="sm"
						onClick={() => startSleepTimer({ kind: "duration", minutes })}
						className="h-7 px-0 text-xs"
					>
						{m["audiobook.player_sleep_minutes"]({ minutes })}
					</Button>
				))}
			</div>
			{hasChapters && (
				<Button
					type="button"
					variant={sleepTimer?.mode.kind === "chapter" ? "default" : "outline"}
					size="sm"
					onClick={() => startSleepTimer({ kind: "chapter" })}
					className="h-7 text-xs"
				>
					{m["audiobook.player_sleep_end_of_chapter"]()}
				</Button>
			)}
			{sleepTimer && (
				<div className="flex gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={extendSleep}
						className="h-7 flex-1 text-xs"
					>
						{m["audiobook.player_sleep_extend"]()}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={cancelSleepTimer}
						className="h-7 flex-1 text-muted-foreground text-xs"
					>
						{m["audiobook.player_sleep_cancel"]()}
					</Button>
				</div>
			)}
		</div>
	);
});

export const SleepButton = memo(function SleepButton() {
	const { sleepTimer } = useAudioPlayerState();
	const label = sleepTimer
		? m["audiobook.player_sleep_active"]({
				time: formatTime(sleepTimer.remaining),
			})
		: m["audiobook.player_sleep"]();

	return (
		<PlayerPopoverButton
			label={label}
			className={cn(
				"h-9 w-auto gap-1.5 rounded-full px-3",
				sleepTimer && "text-primary",
			)}
			trigger={
				<>
					<Moon className="size-4" weight={sleepTimer ? "fill" : "regular"} />
					{sleepTimer && (
						<span className="text-xs tabular-nums">
							{formatTime(sleepTimer.remaining)}
						</span>
					)}
				</>
			}
		>
			<SleepSettings />
		</PlayerPopoverButton>
	);
});
