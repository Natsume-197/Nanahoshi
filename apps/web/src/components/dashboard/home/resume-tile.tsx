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
	getCoverPresetUrl,
	getCoverSrcSet,
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
		<p className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground text-xs tabular-nums">
			{isActive && isPlaying && <PlayingIndicator />}
			<span className="truncate">
				{formatTime(livePosition)} / {formatTime(liveDuration)}
			</span>
		</p>
	);
}

/**
 * Compact Spotify-style resume row for the Continue grids: cover flush
 * against the left edge, with title, compact metadata, and a restrained
 * progress rail beside it. No card surface — it sits on the page background.
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
	const clampedProgress = Math.round(Math.min(Math.max(progress, 0), 100));
	const hasDetail =
		isAudiobook || (exploredCharCount != null && bookCharCount != null);

	const preloadedRef = useRef(false);
	const preloadOnIntent = useCallback(() => {
		if (isAudiobook) prefetchAudiobook(uuid);
		if (preloadedRef.current || !coverFilename) return;
		preloadedRef.current = true;
		const img = new Image();
		img.src = getCoverPresetUrl(coverFilename, coverPresets.detail);
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
		<div className="group/tile @container relative isolate flex h-[8.75rem] items-center overflow-hidden rounded-lg sm:h-40">
			{/* The tile has no resting surface, so hover fades in the soft card
			    plane. Premounted layer + opacity: transitioning background-color
			    would style-recalc + paint every frame as the cursor sweeps the row.
			    -z-10 is scoped by `isolate`, keeping it behind the tile content. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-surface-card opacity-0 transition-opacity duration-200 ease-out group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 group-active/tile:opacity-100 motion-reduce:transition-none"
			/>
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
						src={getCoverPresetUrl(coverFilename, coverPresets.small)}
						srcSet={getCoverSrcSet(coverFilename, coverPresets.small.widths)}
						sizes="160px"
						alt=""
						className="h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out motion-reduce:transition-none"
						loading={priority ? "eager" : "lazy"}
						fetchPriority={priority ? "high" : "auto"}
						decoding="async"
						width={isAudiobook ? 160 : 107}
						height={160}
						onLoad={(e) => {
							e.currentTarget.classList.remove("opacity-0");
						}}
						ref={(el) => {
							if (el?.complete) el.classList.remove("opacity-0");
						}}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center px-1 text-center text-[0.625rem] text-muted-foreground leading-tight">
						{m["book.no_cover"]()}
					</div>
				)}
			</div>
			<div className="pointer-events-none min-w-0 flex-1 px-4 py-3 sm:px-5">
				<Link
					{...detailLinkProps}
					onMouseEnter={preloadOnIntent}
					className="pointer-events-auto relative z-10 line-clamp-2 font-medium text-lg leading-snug underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					{displayTitle}
				</Link>
				{(hasDetail || lastActivityAt) && (
					<div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
						{isAudiobook ? (
							<TileAudiobookTime
								uuid={uuid}
								positionSeconds={positionSeconds}
								totalSeconds={totalSeconds}
							/>
						) : (
							exploredCharCount != null &&
							bookCharCount != null && (
								<span className="min-w-0 truncate">
									{exploredCharCount.toLocaleString()} /{" "}
									{bookCharCount.toLocaleString()}{" "}
									{m["book.characters"]().toLowerCase()}
								</span>
							)
						)}
						{lastActivityAt && (
							<span className="flex @max-sm:hidden shrink-0 items-center gap-1.5">
								{hasDetail && <span aria-hidden>•</span>}
								<span>{formatRelativeTime(lastActivityAt)}</span>
							</span>
						)}
					</div>
				)}
				<div className="mt-2 flex items-center gap-2">
					<div
						className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10"
						role="progressbar"
						aria-label={
							isAudiobook
								? m["aria.listening_progress"]()
								: m["aria.reading_progress"]()
						}
						aria-valuenow={clampedProgress}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<div
							className="h-full rounded-full bg-primary/85"
							style={{ width: `${clampedProgress}%` }}
						/>
					</div>
					<span className="shrink-0 text-foreground/75 text-xs tabular-nums">
						{clampedProgress}%
					</span>
				</div>
			</div>
		</div>
	);
});
