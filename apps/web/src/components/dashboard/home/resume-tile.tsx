import { Link } from "@tanstack/react-router";
import { memo, useCallback, useRef } from "react";
import {
	usePlayAudiobook,
	usePrefetchAudiobook,
} from "@/components/audio-player/use-play-audiobook";
import {
	useAudioPlayerState,
	useIsAudiobookLoading,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverSrcSet,
	getCoverUrl,
} from "@/utils/covers";
import { formatRelativeTime, formatTime } from "@/utils/format";
import { PlayingIndicator } from "./resume-card";

export const MAX_RESUME_TILES = 3;

interface ResumeTileProps {
	uuid: string;
	title?: string | null;
	filename: string;
	cover: string | null;
	/** 0–100. */
	progress: number;
	/** Audiobooks only: current playback position, in seconds. */
	positionSeconds?: number | null;
	/** Audiobooks only: total duration, in seconds. */
	totalSeconds?: number | null;
	/** Ebooks only: current and total character counts. */
	exploredCharCount?: number | null;
	bookCharCount?: number | null;
	mediaType?: "ebook" | "audiobook";
	lastActivityAt?: string | null;
	priority?: boolean;
}

// Subscribes to player state in its own component so time ticks only
// re-render this status slot, not the whole tile grid row. Mirrors the
// live position/duration behavior of ResumeCard's AudiobookStatus.
function TileAudiobookTime({
	uuid,
	positionSeconds,
	totalSeconds,
}: {
	uuid: string;
	positionSeconds?: number | null;
	totalSeconds?: number | null;
}) {
	const { audiobook, isPlaying, globalCurrentTime, totalDuration } =
		useAudioPlayerState();
	const isActive = audiobook?.uuid === uuid;
	const liveDuration =
		isActive && totalDuration > 0 ? totalDuration : (totalSeconds ?? 0);
	const livePosition = isActive ? globalCurrentTime : (positionSeconds ?? 0);
	return (
		<p className="flex items-center gap-1.5 truncate text-muted-foreground text-xs tabular-nums">
			{isActive && isPlaying && <PlayingIndicator />}
			<span className="truncate">
				{formatTime(livePosition)} / {formatTime(liveDuration)}
			</span>
		</p>
	);
}

/**
 * Compact Spotify-style resume row for the Continue grids: cover flush
 * against the left edge, title + progress beside it, and a thin progress
 * bar along the tile's bottom. Same surface mix as ResumeCard.
 */
export const ResumeTile = memo(function ResumeTile({
	uuid,
	title,
	filename,
	cover,
	progress,
	positionSeconds,
	totalSeconds,
	exploredCharCount,
	bookCharCount,
	mediaType,
	lastActivityAt,
	priority = false,
}: ResumeTileProps) {
	const isAudiobook = mediaType === "audiobook";
	const playAudiobook = usePlayAudiobook();
	const prefetchAudiobook = usePrefetchAudiobook();
	const isLoadingPlayback = useIsAudiobookLoading(uuid);
	const coverFilename = getCoverFilename(cover) ?? undefined;
	const displayTitle = title ?? filename;

	const preloadedRef = useRef(false);
	const preloadOnIntent = useCallback(() => {
		if (isAudiobook) prefetchAudiobook(uuid);
		if (preloadedRef.current || !coverFilename) return;
		preloadedRef.current = true;
		const img = new Image();
		img.src = getCoverUrl(coverFilename, coverPresets.detail.widths[0]);
	}, [isAudiobook, prefetchAudiobook, uuid, coverFilename]);

	const detailLinkProps = isAudiobook
		? ({
				to: "/dashboard/audiobooks/$uuid",
				params: { uuid },
				preload: "intent",
			} as const)
		: ({
				to: "/dashboard/books/$uuid",
				params: { uuid },
				preload: "intent",
			} as const);

	return (
		<div className="theme-gradient-surface group/tile relative flex h-28 items-center overflow-hidden rounded-lg bg-surface-card transition-colors focus-within:bg-surface-card-hover hover:bg-surface-card-hover active:bg-surface-card-hover sm:h-32">
			{isAudiobook ? (
				<button
					type="button"
					onClick={() => playAudiobook(uuid)}
					onPointerEnter={() => prefetchAudiobook(uuid)}
					onMouseEnter={preloadOnIntent}
					onFocus={() => prefetchAudiobook(uuid)}
					disabled={isLoadingPlayback}
					aria-label={m["aria.listen_to"]({ title: displayTitle })}
					aria-busy={isLoadingPlayback}
					className="absolute inset-0 z-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-wait"
				/>
			) : (
				<Link
					to="/reader/$uuid"
					params={{ uuid }}
					aria-label={m["aria.read_book"]({ title: displayTitle })}
					onMouseEnter={preloadOnIntent}
					className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				/>
			)}
			<div
				className={cn(
					"pointer-events-none h-full flex-none overflow-hidden bg-muted",
					isAudiobook ? "aspect-square" : "aspect-[2/3]",
				)}
			>
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, 160)}
						srcSet={getCoverSrcSet(
							coverFilename,
							coverPresets.thumbnail.widths,
						)}
						sizes="128px"
						alt=""
						className="h-full w-full object-cover"
						loading={priority ? "eager" : "lazy"}
						fetchPriority={priority ? "high" : "auto"}
						decoding="async"
						width={isAudiobook ? 128 : 85}
						height={128}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center px-1 text-center text-[0.625rem] text-muted-foreground leading-tight">
						{m["book.no_cover"]()}
					</div>
				)}
			</div>
			<div className="pointer-events-none min-w-0 flex-1 px-3">
				<Link
					{...detailLinkProps}
					onMouseEnter={preloadOnIntent}
					className="pointer-events-auto relative z-10 line-clamp-2 font-semibold text-base leading-snug underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					{displayTitle}
				</Link>
				<p className="mt-0.5 truncate text-muted-foreground text-xs tabular-nums">
					{progress}%
					{lastActivityAt ? ` • ${formatRelativeTime(lastActivityAt)}` : null}
				</p>
				<div className="mt-1.5">
					{isAudiobook ? (
						<TileAudiobookTime
							uuid={uuid}
							positionSeconds={positionSeconds}
							totalSeconds={totalSeconds}
						/>
					) : (
						exploredCharCount != null &&
						bookCharCount != null && (
							<p className="truncate text-muted-foreground text-xs tabular-nums">
								{exploredCharCount.toLocaleString()} /{" "}
								{bookCharCount.toLocaleString()}{" "}
								{m["book.characters"]().toLowerCase()}
							</p>
						)
					)}
				</div>
			</div>
		</div>
	);
});
