import {
	ArrowsClockwise,
	ArrowsOut,
	CircleNotch,
	Headphones,
	Pause,
	Play,
	WarningCircle,
	X,
} from "@phosphor-icons/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { memo } from "react";
import { PlayerSeekBar } from "@/components/audio-player/player-seek-bar";
import { PlayerSettings } from "@/components/audio-player/player-settings";
import { PlayerTransport } from "@/components/audio-player/player-transport";
import { PlayerVolumeControl } from "@/components/audio-player/player-volume-control";
import { Button } from "@/components/ui/button";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getChapterMarkerPercents } from "@/utils/chapters";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";

export const MiniPlayer = memo(function MiniPlayer() {
	const {
		audiobook,
		isPlaying,
		isLoading,
		playbackError,
		globalCurrentTime,
		totalDuration,
	} = useAudioPlayerState();
	const { togglePlay, stop, retry } = useAudioPlayerActions();
	const navigate = useNavigate();
	const location = useLocation();

	if (!audiobook) return null;
	if (location.pathname.startsWith("/player/")) return null;

	const title = audiobook.title ?? audiobook.filename;
	// After a stream failure the play control becomes a retry and the metadata
	// line explains what happened (the toast is transient; this persists).
	const showError = playbackError && !isLoading;
	const authorText = formatNames(audiobook.authors);
	const subtitleText = showError ? m["audiobook.playback_error"]() : authorText;
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

	const handleOpen = () => {
		// View transition: the shared `player-cover` name morphs the mini bar's
		// cover up into the expanded player's artwork, so opening reads as one
		// component growing rather than a hard route swap.
		navigate({
			to: "/player/$uuid",
			params: { uuid: audiobook.uuid },
			viewTransition: true,
		});
	};

	return (
		<div className="fixed inset-x-0 bottom-14 z-40 text-sidebar-foreground md:bottom-0">
			{/* ── Mobile layout ── */}
			<div className="border-sidebar-border border-t bg-sidebar md:hidden">
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
				<div className="flex items-center gap-2 px-2 py-1.5">
					<button
						type="button"
						onClick={handleOpen}
						className="flex min-w-0 flex-1 items-center gap-2"
					>
						<div
							className="size-10 shrink-0 overflow-hidden rounded bg-muted"
							style={{ viewTransitionName: "player-cover" }}
						>
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
						<div className="min-w-0 flex-1 text-left">
							<p className="truncate font-medium text-sm leading-tight">
								{title}
							</p>
							{subtitleText && (
								<p
									className={cn(
										"flex items-center gap-1 truncate text-xs leading-tight",
										showError ? "text-destructive" : "text-muted-foreground",
									)}
								>
									{showError && (
										<WarningCircle className="size-3 shrink-0" weight="fill" />
									)}
									<span className="truncate">{subtitleText}</span>
								</p>
							)}
						</div>
					</button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={
							showError
								? m["audiobook.retry_playback"]()
								: isPlaying
									? "Pause"
									: "Play"
						}
						aria-busy={isLoading}
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
					<Button
						variant="ghost"
						size="icon"
						aria-label="Stop"
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
			<div className="hidden h-[82px] border-border border-t bg-card px-4 text-foreground shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.18)] md:block">
				{/* Spotify-style 3 columns: info left, transport + progress centered
				    (~half width), secondary controls right. */}
				<div className="flex h-full w-full items-center gap-4">
					{/* Left: Cover + info (gets its own breathing room) */}
					<button
						type="button"
						onClick={handleOpen}
						className="flex min-w-0 flex-1 items-center gap-2.5"
					>
						<div
							className="size-10 shrink-0 overflow-hidden rounded bg-muted"
							style={{ viewTransitionName: "player-cover" }}
						>
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
						<div className="min-w-0 flex-1 text-left">
							<p className="truncate font-medium text-sm leading-tight">
								{title}
							</p>
							{subtitleText && (
								<p
									className={cn(
										"flex items-center gap-1 truncate text-xs leading-tight",
										showError ? "text-destructive" : "text-muted-foreground",
									)}
								>
									{showError && (
										<WarningCircle className="size-3 shrink-0" weight="fill" />
									)}
									<span className="truncate">{subtitleText}</span>
								</p>
							)}
						</div>
					</button>

					{/* Center: transport on top, progress below — constrained to ~half. */}
					<div className="flex w-1/2 max-w-3xl shrink-0 flex-col items-center gap-1">
						<PlayerTransport size="sm" />
						<PlayerSeekBar className="w-full" />
					</div>

					{/* Right: Volume · Settings · Fullscreen · Close */}
					<div className="flex min-w-0 flex-1 items-center justify-end gap-0.5">
						<PlayerVolumeControl />
						<PlayerSettings />
						<Button
							variant="ghost"
							size="icon"
							aria-label="Open full player"
							onClick={handleOpen}
							className="size-8 text-muted-foreground"
						>
							<ArrowsOut className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Stop"
							onClick={stop}
							className="size-8 text-muted-foreground"
						>
							<X className="size-4" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
});
