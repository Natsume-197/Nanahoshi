import { Link } from "@tanstack/react-router";
import { type CSSProperties, memo, useCallback, useRef } from "react";
import {
	usePlayAudiobook,
	usePrefetchAudiobook,
} from "@/components/audio-player/use-play-audiobook";
import { AuthorLinkList } from "@/components/books/author-link-list";
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

/** Width of a resume card inside the continue reading/listening grids. */
export const RESUME_CARD_WIDTH_CLASS =
	"w-[calc(100vw-2rem)] min-w-[calc(100vw-2rem)] max-w-[21rem] sm:w-[28.5rem] sm:min-w-[28.5rem] sm:max-w-none lg:w-[34rem] lg:min-w-[34rem]";

export const MAX_RESUME_CARDS = 3;

interface ResumeCardProps {
	uuid: string;
	title?: string | null;
	filename: string;
	cover: string | null;
	authors?: { uuid?: string | null; name: string; role?: string | null }[];
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
	/** Let the item fill its responsive grid cell. */
	fillRow?: boolean;
}

/** Spotify-like equalizer, shown beside the status line while playing. */
function PlayingIndicator() {
	return (
		<span
			aria-hidden
			className="flex h-3 shrink-0 items-end gap-0.5 text-primary"
		>
			<span className="playing-bar [animation-delay:-0.45s]" />
			<span className="playing-bar [animation-delay:-0.2s]" />
			<span className="playing-bar [animation-delay:-0.35s]" />
			<span className="playing-bar [animation-delay:-0.1s]" />
		</span>
	);
}

function AudiobookStatus({
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
		<p className="flex min-w-0 flex-1 items-center gap-1.5 truncate @sm:text-sm text-[0.8125rem] text-[var(--resume-fg-muted)] tabular-nums">
			{isActive && isPlaying && <PlayingIndicator />}
			<span className="truncate">
				{formatTime(livePosition)} / {formatTime(liveDuration)}
			</span>
		</p>
	);
}

/**
 * Wide variant of the media tile for the Continue reading/listening rows: the
 * cover sits beside its title, authors, recent activity, and progress status.
 * Its surface is a restrained perceptual mix of the page and card tokens.
 */
export const ResumeCard = memo(function ResumeCard({
	uuid,
	title,
	filename,
	cover,
	authors,
	progress,
	positionSeconds,
	totalSeconds,
	exploredCharCount,
	bookCharCount,
	mediaType,
	lastActivityAt,
	priority = false,
	fillRow = false,
}: ResumeCardProps) {
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
		<div
			className={cn(
				"@container relative flex h-[10rem] shrink-0 overflow-hidden rounded-xl bg-[color-mix(in_oklab,var(--background)_60%,var(--card))] sm:h-[12rem]",
				RESUME_CARD_WIDTH_CLASS,
				fillRow &&
					"w-full min-w-full max-w-none sm:w-full sm:min-w-full lg:w-full lg:min-w-full",
			)}
			style={
				{
					"--resume-fg": "var(--foreground)",
					"--resume-fg-muted": "var(--muted-foreground)",
				} as CSSProperties
			}
		>
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
					className="absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-wait"
				/>
			) : (
				<Link
					to="/reader/$uuid"
					params={{ uuid }}
					aria-label={m["aria.read_book"]({ title: displayTitle })}
					onMouseEnter={preloadOnIntent}
					className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				/>
			)}
			<div
				className={cn(
					"pointer-events-none relative h-full shrink-0 self-stretch overflow-hidden rounded-lg bg-muted shadow-sm",
					isAudiobook ? "aspect-square" : "aspect-[2/3]",
				)}
			>
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, 240)}
						srcSet={getCoverSrcSet(
							coverFilename,
							coverPresets.thumbnail.widths,
						)}
						sizes={
							isAudiobook
								? "(min-width: 640px) 192px, 160px"
								: "(min-width: 640px) 128px, 107px"
						}
						alt=""
						className="h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out"
						loading={priority ? "eager" : "lazy"}
						fetchPriority={priority ? "high" : "auto"}
						decoding="async"
						width={isAudiobook ? 192 : 128}
						height={192}
						onLoad={(e) => {
							e.currentTarget.classList.remove("opacity-0");
						}}
						ref={(el) => {
							if (el?.complete) el.classList.remove("opacity-0");
						}}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
						{m["book.no_cover"]()}
					</div>
				)}
			</div>
			<div className="pointer-events-none flex min-w-0 flex-1 flex-col overflow-hidden @sm:p-4 p-3">
				<Link
					{...detailLinkProps}
					onMouseEnter={preloadOnIntent}
					className="pointer-events-auto relative z-10 line-clamp-2 font-semibold @sm:text-lg text-[var(--resume-fg)] text-base leading-snug decoration-[var(--resume-fg)]/50 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					{displayTitle}
				</Link>
				{authors && authors.length > 0 && (
					<AuthorLinkList
						authors={authors}
						className="pointer-events-auto relative z-10 @sm:mt-1 mt-0.5 line-clamp-1 @sm:text-sm text-[var(--resume-fg-muted)] text-xs [&>span]:inline"
						linkClassName="transition-colors hover:text-[var(--resume-fg)]"
					/>
				)}
				<div className="mt-auto @sm:space-y-2 space-y-1.5 @sm:pt-3 pt-2">
					{lastActivityAt && (
						<p className="truncate @sm:text-sm text-[var(--resume-fg-muted)] text-xs">
							<span className="@max-sm:hidden">
								{isAudiobook
									? m["home.resume_last_listened"]()
									: m["home.resume_last_read"]()}{" "}
							</span>
							{formatRelativeTime(lastActivityAt)}
						</p>
					)}
					<div className="flex items-center gap-2">
						<div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--resume-fg)]/15">
							<div
								className="h-full rounded-full bg-primary/80"
								style={{
									width: `${Math.min(Math.max(progress, 0), 100)}%`,
								}}
							/>
						</div>
						<span className="shrink-0 @sm:text-sm text-[var(--resume-fg-muted)] text-xs tabular-nums">
							{Math.round(Math.min(Math.max(progress, 0), 100))}%
						</span>
					</div>
					{isAudiobook && (
						<div className="flex items-center gap-2.5 sm:gap-4">
							<AudiobookStatus
								uuid={uuid}
								positionSeconds={positionSeconds}
								totalSeconds={totalSeconds}
							/>
						</div>
					)}
					{!isAudiobook &&
						exploredCharCount != null &&
						bookCharCount != null && (
							<p className="@max-sm:hidden truncate @sm:text-sm text-[0.8125rem] text-[var(--resume-fg-muted)] tabular-nums">
								{exploredCharCount.toLocaleString()} /{" "}
								{bookCharCount.toLocaleString()}{" "}
								{m["book.characters"]().toLowerCase()}
							</p>
						)}
				</div>
			</div>
		</div>
	);
});
