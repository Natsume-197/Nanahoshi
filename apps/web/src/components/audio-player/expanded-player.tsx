import {
	ArrowSquareOut,
	CaretDown,
	Headphones,
	ListBullets,
	WarningCircle,
	X,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { memo, useMemo, useState } from "react";
import {
	getProgressReadout,
	type ProgressScope,
	realTimeAt,
} from "@/components/audio-player/chapter-progress";
import { PlayerChapterPanel } from "@/components/audio-player/player-chapter-panel";
import { PlayerIconButton } from "@/components/audio-player/player-controls";
import { PlayerLikeButton } from "@/components/audio-player/player-like-button";
import { PlayerSeekBar } from "@/components/audio-player/player-seek-bar";
import { PlayerSettings } from "@/components/audio-player/player-settings";
import { SleepButton } from "@/components/audio-player/player-sleep-control";
import { SpeedButton } from "@/components/audio-player/player-speed-control";
import { PlayerTransport } from "@/components/audio-player/player-transport";
import { PlayerVolumeControl } from "@/components/audio-player/player-volume-control";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatChapterLabel } from "@/utils/chapters";
import {
	coverPresets,
	getCoverFilename,
	getCoverSrcSet,
	getCoverUrl,
} from "@/utils/covers";
import { formatNames, formatTime } from "@/utils/format";

// The artwork fills up to 38dvh, well past the detail page's frame, so it
// declares its own sizes off the same width ladder.
const COVER_SIZES = "(max-width: 767px) 60vw, 420px";

export const ExpandedPlayer = memo(function ExpandedPlayer() {
	const {
		audiobook,
		activeChapterIndex,
		globalCurrentTime,
		totalDuration,
		speed,
		showError,
	} = useAudioPlayerState();
	const { seekTo, stop, setExpanded } = useAudioPlayerActions();

	const [scope, setScope] = useState<ProgressScope>("book");
	const [showChapters, setShowChapters] = useState(false);

	const cover = useMemo(() => {
		const filename = getCoverFilename(audiobook?.cover);
		if (!filename) return null;
		return {
			url: getCoverUrl(filename, 600),
			srcSet: getCoverSrcSet(filename, coverPresets.detail.widths),
		};
	}, [audiobook?.cover]);
	const authorText = useMemo(
		() => formatNames(audiobook?.authors ?? []),
		[audiobook?.authors],
	);
	const narratorText = useMemo(
		() => formatNames(audiobook?.narrators ?? []),
		[audiobook?.narrators],
	);

	if (!audiobook) return null;

	const title = audiobook.title ?? audiobook.filename;
	const chapters = audiobook.chapters;
	const hasChapters = chapters.length > 0;
	const chapter = chapters[activeChapterIndex];
	const { remaining } = getProgressReadout(scope, {
		globalTime: globalCurrentTime,
		totalDuration,
		chapter,
	});
	// Remaining wall-clock time at the current rate, not remaining book seconds.
	const timeLeft = formatTime(realTimeAt(remaining, speed));

	return (
		<div
			className="relative flex h-full flex-col overflow-hidden"
			style={
				audiobook.mainColor
					? ({ "--player-tint": audiobook.mainColor } as React.CSSProperties)
					: undefined
			}
		>
			{audiobook.mainColor && (
				<div
					aria-hidden
					// A light wash off the artwork, kept weaker on the white canvas where
					// the same mix reads as a colored surface.
					className="pointer-events-none absolute inset-0 [--tint-strength:12%] dark:[--tint-strength:22%]"
					style={{
						backgroundImage:
							"radial-gradient(120% 70% at 50% 0%, color-mix(in oklab, var(--player-tint) var(--tint-strength), transparent), transparent 70%)",
					}}
				/>
			)}

			<div className="relative flex h-14 shrink-0 items-center justify-between gap-2 px-2 md:h-16 md:px-4">
				<PlayerIconButton
					label={m["audiobook.player_collapse"]()}
					side="bottom"
					onClick={() => setExpanded(false)}
					className="size-9"
				>
					<CaretDown className="size-5" />
				</PlayerIconButton>

				<p className="truncate text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
					{m["audiobook.player_now_playing"]()}
				</p>

				<div className="flex shrink-0 items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								asChild
								variant="ghost"
								size="icon"
								className="size-8 text-muted-foreground"
							>
								<Link
									to="/dashboard/audiobooks/$uuid"
									params={{ uuid: audiobook.uuid }}
									aria-label={m["audiobook.player_view_details"]()}
									onClick={() => setExpanded(false)}
								>
									<ArrowSquareOut className="size-4" />
								</Link>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={8}>
							{m["audiobook.player_view_details"]()}
						</TooltipContent>
					</Tooltip>
					<PlayerSettings side="bottom" />
					<PlayerIconButton
						label={m["audiobook.player_stop"]()}
						side="bottom"
						onClick={stop}
					>
						<X className="size-4" />
					</PlayerIconButton>
				</div>
			</div>

			<div className="relative flex min-h-0 min-w-0 flex-1 gap-6 overflow-hidden px-4 pb-4 md:px-8 md:pb-8 lg:gap-10">
				<div
					className={cn(
						"mx-auto flex min-h-0 w-full min-w-0 max-w-3xl flex-1 flex-col items-center justify-center gap-5 overflow-y-auto overflow-x-hidden md:gap-7",
						showChapters && "hidden md:flex",
					)}
				>
					<div className="flex w-full min-w-0 flex-col items-center gap-5 md:flex-row md:items-end md:gap-8">
						<div className="flex shrink-0 items-center justify-center">
							{cover ? (
								<img
									src={cover.url}
									srcSet={cover.srcSet}
									sizes={COVER_SIZES}
									alt={title}
									className="max-h-[32dvh] w-auto max-w-full rounded-xl object-contain shadow-2xl outline outline-1 outline-[var(--image-outline)] -outline-offset-1 md:max-h-[38dvh]"
									decoding="async"
								/>
							) : (
								<div className="flex aspect-square h-[32dvh] max-w-full items-center justify-center rounded-xl bg-muted md:h-[38dvh]">
									<Headphones
										className="size-16 text-muted-foreground/40"
										weight="thin"
									/>
								</div>
							)}
						</div>

						<div className="min-w-0 flex-1 text-center md:pb-2 md:text-start">
							<div className="flex items-start justify-center gap-1.5 md:justify-start">
								<h2
									title={title}
									className="line-clamp-2 text-balance font-bold text-xl leading-tight md:text-3xl"
								>
									{title}
								</h2>
								<PlayerLikeButton className="mt-1 size-7 shrink-0" />
							</div>
							{authorText && (
								<p className="mt-1.5 truncate text-muted-foreground text-sm md:text-base">
									{authorText}
								</p>
							)}
							{narratorText && (
								<p className="mt-0.5 truncate text-muted-foreground/80 text-xs md:text-sm">
									{m["audiobook.narrated_by"]()} {narratorText}
								</p>
							)}
							{showError ? (
								<p className="mt-3 flex items-center justify-center gap-1.5 text-destructive text-sm md:justify-start">
									<WarningCircle className="size-4 shrink-0" weight="fill" />
									{m["audiobook.playback_error"]()}
								</p>
							) : (
								<div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted-foreground text-xs md:justify-start">
									{chapter && (
										<>
											<span className="max-w-full truncate font-medium text-foreground/80">
												{formatChapterLabel(chapter, activeChapterIndex)}
											</span>
											<span>
												{m["audiobook.player_chapter_of"]({
													current: activeChapterIndex + 1,
													total: chapters.length,
												})}
											</span>
										</>
									)}
									<span>·</span>
									<span className="tabular-nums">
										{m["audiobook.time_left"]({ time: timeLeft })}
									</span>
								</div>
							)}
						</div>
					</div>

					<div className="w-full min-w-0">
						<PlayerSeekBar size="lg" scope={scope} chapter={chapter} />
					</div>

					<PlayerTransport size="expanded" />

					<div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-1">
						<SpeedButton />
						<SleepButton />
						<div className="hidden md:block">
							<PlayerVolumeControl className="size-9" />
						</div>
						{hasChapters && (
							<>
								<Button
									variant="ghost"
									size="sm"
									aria-pressed={scope === "chapter"}
									onClick={() =>
										setScope((prev) => (prev === "book" ? "chapter" : "book"))
									}
									className={cn(
										"h-9 rounded-full text-muted-foreground text-xs",
										scope === "chapter" && "bg-muted text-foreground",
									)}
								>
									{m["audiobook.player_chapter_time"]()}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									aria-pressed={showChapters}
									onClick={() => setShowChapters((prev) => !prev)}
									className={cn(
										"h-9 gap-1.5 rounded-full text-muted-foreground text-xs",
										showChapters && "bg-muted text-foreground",
									)}
								>
									<ListBullets className="size-4" />
									{m["audiobook.player_chapters"]()}
								</Button>
							</>
						)}
					</div>
				</div>

				{/* Phones: the list takes the artwork column's place. From md it docks
				    beside it, so the transport never moves. */}
				{showChapters && (
					<PlayerChapterPanel
						chapters={chapters}
						activeIndex={activeChapterIndex}
						onSeekToChapter={seekTo}
						className="min-h-0 min-w-0 flex-1 md:w-80 md:flex-none md:rounded-2xl md:border md:border-border md:bg-card/60 md:p-3 lg:w-96"
					/>
				)}
			</div>
		</div>
	);
});
