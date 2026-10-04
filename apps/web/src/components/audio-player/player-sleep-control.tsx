import { Button } from "@nanahoshi/ui/components/button";
import { cn } from "@nanahoshi/ui/lib/utils";
import { Moon } from "@phosphor-icons/react";
import { memo } from "react";
import { PlayerSheetButton } from "@/components/audio-player/player-controls";
import { SLEEP_DURATIONS } from "@/components/audio-player/sleep-timer";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";
import { formatTime } from "@/utils/format";

export const SleepSettings = memo(function SleepSettings({
	touch = false,
}: {
	/** Finger-sized rows, for the phone sheet. */
	touch?: boolean;
}) {
	const { audiobook, sleepTimer } = useAudioPlayerState();
	const { startSleepTimer, extendSleep, cancelSleepTimer } =
		useAudioPlayerActions();

	const hasChapters = (audiobook?.chapters.length ?? 0) > 0;
	const activeMinutes =
		sleepTimer?.mode.kind === "duration" ? sleepTimer.mode.minutes : null;
	const activeKind = sleepTimer?.mode.kind ?? null;
	const rowClass = touch ? "h-11 text-sm" : "h-7 text-xs";

	return (
		<div className={cn("flex flex-col", touch ? "gap-2.5" : "gap-2")}>
			<div className="flex items-center justify-between gap-2">
				{/* The sheet's own heading already names it. */}
				{!touch && (
					<p className="flex items-center gap-1.5 font-medium text-xs">
						<Moon className="size-3.5" />
						{m["audiobook.player_sleep"]()}
					</p>
				)}
				{sleepTimer && (
					<span className="text-[11px] text-primary tabular-nums">
						{formatTime(sleepTimer.remaining)}
					</span>
				)}
			</div>
			<div className={cn("grid grid-cols-3", touch ? "gap-1.5" : "gap-1")}>
				{SLEEP_DURATIONS.map((minutes) => (
					<Button
						key={minutes}
						type="button"
						variant={activeMinutes === minutes ? "default" : "outline"}
						size="sm"
						onClick={() => startSleepTimer({ kind: "duration", minutes })}
						className={cn("px-0", rowClass)}
					>
						{m["audiobook.player_sleep_minutes"]({ minutes })}
					</Button>
				))}
			</div>
			{hasChapters && (
				<Button
					type="button"
					variant={activeKind === "chapter" ? "default" : "outline"}
					size="sm"
					onClick={() => startSleepTimer({ kind: "chapter" })}
					className={rowClass}
				>
					{m["audiobook.player_sleep_end_of_chapter"]()}
				</Button>
			)}
			<Button
				type="button"
				variant={activeKind === "book-end" ? "default" : "outline"}
				size="sm"
				onClick={() => startSleepTimer({ kind: "book-end" })}
				className={rowClass}
			>
				{m["audiobook.player_sleep_end_of_book"]()}
			</Button>
			{sleepTimer && (
				<div className={cn("flex", touch ? "gap-1.5" : "gap-1")}>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={extendSleep}
						className={cn("flex-1", rowClass)}
					>
						{m["audiobook.player_sleep_extend"]()}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={cancelSleepTimer}
						className={cn("flex-1 text-muted-foreground", rowClass)}
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
		<PlayerSheetButton
			label={label}
			title={m["audiobook.player_sleep"]()}
			align="start"
			className={cn(
				"h-11 w-auto gap-1.5 rounded-full px-4",
				sleepTimer ? "text-primary" : "text-foreground",
			)}
			trigger={
				<>
					<Moon className="size-5" weight={sleepTimer ? "fill" : "regular"} />
					{sleepTimer && (
						<span className="text-sm tabular-nums">
							{formatTime(sleepTimer.remaining)}
						</span>
					)}
				</>
			}
		>
			{(touch) => <SleepSettings touch={touch} />}
		</PlayerSheetButton>
	);
});
