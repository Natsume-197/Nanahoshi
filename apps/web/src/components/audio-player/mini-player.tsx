import {
	ArrowsClockwise,
	CircleNotch,
	Headphones,
	Pause,
	Play,
	WarningCircle,
	X,
} from "@phosphor-icons/react";
import { memo } from "react";
import { PlayerLikeButton } from "@/components/audio-player/player-like-button";
import { PlayerSeekBar } from "@/components/audio-player/player-seek-bar";
import { PlayerSettings } from "@/components/audio-player/player-settings";
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
import {
	formatChapterLabel,
	getActiveChapterIndex,
	getChapterMarkerPercents,
} from "@/utils/chapters";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";

/**
 * The title/author/chapter stack, shared by the mobile and desktop layouts. On
 * error the second line explains the failure instead; otherwise author and
 * chapter each get their own line, and each is dropped when absent.
 */
function TrackMeta({
	title,
	authorText,
	chapterLabel,
	showError,
}: {
	title: string;
	authorText: string | undefined;
	chapterLabel: string | null;
	showError: boolean;
}) {
	return (
		<div className="min-w-0 flex-1 text-left">
			<div className="flex items-center gap-1">
				<p className="truncate font-medium text-sm leading-tight">{title}</p>
				<PlayerLikeButton />
			</div>
			{showError ? (
				<p className="mt-0.5 flex items-center gap-1 truncate text-destructive text-xs leading-tight">
					<WarningCircle className="size-3 shrink-0" weight="fill" />
					<span className="truncate">{m["audiobook.playback_error"]()}</span>
				</p>
			) : (
				<>
					{authorText && (
						<p className="mt-0.5 truncate text-muted-foreground text-xs leading-tight">
							{authorText}
						</p>
					)}
					{chapterLabel && (
						<p className="mt-0.5 truncate text-[11px] text-muted-foreground/80 leading-tight">
							{chapterLabel}
						</p>
					)}
				</>
			)}
		</div>
	);
}

export const MiniPlayer = memo(function MiniPlayer() {
	const {
		audiobook,
		isPlaying,
		isLoading,
		isBuffering,
		playbackError,
		globalCurrentTime,
		totalDuration,
	} = useAudioPlayerState();
	const { togglePlay, stop, retry } = useAudioPlayerActions();

	if (!audiobook) return null;

	const title = audiobook.title ?? audiobook.filename;
	// After a stream failure the play control becomes a retry and the metadata
	// line explains what happened (the toast is transient; this persists).
	const showError = playbackError && !isLoading;
	const showBuffering = isBuffering && !isLoading && !showError;
	const authorText = formatNames(audiobook.authors);
	const activeChapterIndex = getActiveChapterIndex(
		audiobook.chapters,
		globalCurrentTime,
	);
	const chapterLabel =
		activeChapterIndex >= 0
			? formatChapterLabel(
					audiobook.chapters[activeChapterIndex],
					activeChapterIndex,
				)
			: null;
	const coverFilename = getCoverFilename(audiobook.cover);
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.thumbnail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.thumbnail.widths)
		: undefined;

	const progress =
		totalDuration > 0 ? (globalCurrentTime / totalDuration) * 100 : 0;

	// Mobile progress bar shows chapter starts as markers (global time).
	const chapterMarkers = getChapterMarkerPercents(
		audiobook.chapters,
		totalDuration,
	);

	return (
		<div className="fixed inset-x-0 bottom-[calc(var(--mobile-tabbar-height)+var(--safe-area-bottom))] z-40 text-sidebar-foreground md:bottom-0">
			{/* ── Mobile layout ── */}
			<div className="h-[var(--mobile-player-height)] border-sidebar-border border-t bg-sidebar pr-[var(--safe-area-right)] pl-[var(--safe-area-left)] md:hidden">
				{/* Thin progress bar with chapter markers */}
				<div className="relative h-0.5 bg-foreground/20">
					<div
						className="h-full bg-foreground transition-[width] duration-300"
						style={{ width: `${progress}%` }}
					/>
					{chapterMarkers.map((pct) => (
						<span
							key={pct}
							className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-sidebar"
							style={{ left: `${pct}%` }}
						/>
					))}
				</div>
				<div className="flex h-[calc(var(--mobile-player-height)-2px)] items-center gap-2 px-2">
					<div className="flex min-w-0 flex-1 items-center gap-2.5">
						<div className="size-11 shrink-0 overflow-hidden rounded bg-muted">
							{coverUrl ? (
								<img
									src={coverUrl}
									srcSet={coverSrcSet}
									sizes={coverPresets.thumbnail.sizes}
									alt={title}
									className="h-full w-full object-cover"
									loading="eager"
									decoding="async"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<Headphones className="size-4 text-muted-foreground" />
								</div>
							)}
						</div>
						<TrackMeta
							title={title}
							authorText={authorText}
							chapterLabel={chapterLabel}
							showError={showError}
						/>
					</div>
					<div className="relative flex shrink-0 items-center justify-center">
						{showBuffering && (
							<span
								aria-hidden
								className="pointer-events-none absolute inset-0.5 animate-spin rounded-full border-2 border-foreground/25 border-t-foreground"
							/>
						)}
						<Button
							variant="ghost"
							size="icon"
							aria-label={
								showError
									? m["audiobook.retry_playback"]()
									: isPlaying
										? m["audiobook.player_pause"]()
										: m["audiobook.player_play"]()
							}
							aria-busy={isLoading || showBuffering}
							onClick={showError ? retry : togglePlay}
							className={cn("size-8", showError && "text-destructive")}
						>
							{isLoading ? (
								<CircleNotch className="size-5 animate-spin" />
							) : showError ? (
								<ArrowsClockwise className="size-5" />
							) : isPlaying ? (
								<Pause className="size-5" />
							) : (
								<Play className="ml-0.5 size-5" />
							)}
						</Button>
					</div>
					<Button
						variant="ghost"
						size="icon"
						aria-label={m["audiobook.player_stop"]()}
						onClick={stop}
						className="size-7 text-muted-foreground"
					>
						<X className="size-4" />
					</Button>
				</div>
			</div>

			{/* ── Desktop: a distinct full-width dock (its own surface + top shadow),
			     so it reads as a global player rather than an extension of the
			     sidebar's profile footer above it ── */}
			{/* The bar's own surface absorbs the bottom inset (a tablet in landscape
			    is >=md and still has a home indicator), so the transport row never
			    lands under system UI. --player-reserve keeps the layout in step. */}
			<div className="hidden h-[var(--player-reserve)] border-border border-t bg-card px-4 pb-[var(--safe-area-bottom)] text-foreground shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.18)] md:block">
				{/* Spotify-style 3 columns: info left, transport + progress centered
				    (~half width), secondary controls right. */}
				<div className="flex h-full w-full items-center gap-4">
					{/* Left: Cover + info (gets its own breathing room) */}
					<div className="flex min-w-0 flex-1 items-center gap-2.5">
						<div className="size-12 shrink-0 overflow-hidden rounded bg-muted">
							{coverUrl ? (
								<img
									src={coverUrl}
									srcSet={coverSrcSet}
									sizes={coverPresets.thumbnail.sizes}
									alt={title}
									className="h-full w-full object-cover"
									loading="eager"
									decoding="async"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<Headphones className="size-4 text-muted-foreground" />
								</div>
							)}
						</div>
						<TrackMeta
							title={title}
							authorText={authorText}
							chapterLabel={chapterLabel}
							showError={showError}
						/>
					</div>

					{/* Center: transport on top, progress below — constrained to ~half. */}
					<div className="flex w-1/2 max-w-3xl shrink-0 flex-col items-center gap-1">
						<PlayerTransport />
						<PlayerSeekBar className="w-full" />
					</div>

					{/* Right: Volume · Settings · Close */}
					<div className="flex min-w-0 flex-1 items-center justify-end gap-0.5">
						<PlayerVolumeControl />
						<PlayerSettings />
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									aria-label={m["audiobook.player_stop"]()}
									onClick={stop}
									className="size-8 text-muted-foreground"
								>
									<X className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" sideOffset={8}>
								{m["audiobook.player_stop"]()}
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>
		</div>
	);
});
