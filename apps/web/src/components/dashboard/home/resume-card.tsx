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

/** Width of a resume card inside the continue reading/listening carousels. */
export const RESUME_CARD_WIDTH_CLASS =
	"w-[calc(100vw-2rem)] min-w-[calc(100vw-2rem)] max-w-[21rem] sm:w-[28.5rem] sm:min-w-[28.5rem] sm:max-w-none lg:w-[34rem] lg:min-w-[34rem]";

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
		<p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[0.8125rem] text-[var(--resume-fg-muted)] tabular-nums sm:text-sm">
			{isActive && isPlaying && <PlayingIndicator />}
			<span className="truncate">
				{formatTime(livePosition)} / {formatTime(liveDuration)}
			</span>
		</p>
	);
}

/**
 * Wide variant of the media tile for the Continue reading/listening rows:
 * the cover beside its title, authors, recent activity, and an always-visible
 * resume button paired with the remaining-time/percent status. Shares the
 * tinted wash and hover tint of BookCardShell.
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
				// Fixed height so every card is the same size regardless of content or
				// format — ebook and audiobook cards line up when mixed in one row.
				"group relative isolate flex h-[10rem] shrink-0 overflow-hidden rounded-xl bg-card sm:h-[12rem]",
				RESUME_CARD_WIDTH_CLASS,
			)}
			style={
				{
					"--resume-fg": "var(--foreground)",
					"--resume-fg-muted": "var(--muted-foreground)",
				} as CSSProperties
			}
		>
			{/* Same premounted hover layer as BookCardShell: opacity composites off
			    the main thread instead of transitioning background-color. Brightens
			    the tinted background instead of replacing it. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-foreground/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
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
					"pointer-events-none relative h-full shrink-0 self-stretch overflow-hidden bg-muted shadow-sm",
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
								? "(min-width: 640px) 192px, 168px"
								: "(min-width: 640px) 128px, 112px"
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
			<div className="pointer-events-none flex min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
				<Link
					{...detailLinkProps}
					onMouseEnter={preloadOnIntent}
					className="pointer-events-auto relative z-10 line-clamp-2 font-semibold text-[0.9375rem] text-[var(--resume-fg)] leading-snug decoration-[var(--resume-fg)]/50 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:text-lg"
				>
					{displayTitle}
				</Link>
				{authors && authors.length > 0 && (
					<AuthorLinkList
						authors={authors}
						className="pointer-events-auto relative z-10 mt-0.5 line-clamp-1 text-[var(--resume-fg-muted)] text-xs sm:mt-1 sm:text-sm [&>span]:inline"
						linkClassName="transition-colors hover:text-[var(--resume-fg)]"
					/>
				)}
				<div className="mt-auto space-y-1.5 pt-2 sm:space-y-2 sm:pt-3">
					{lastActivityAt && (
						<p className="truncate text-[var(--resume-fg-muted)] text-xs sm:text-sm">
							{isAudiobook
								? m["home.resume_last_listened"]()
								: m["home.resume_last_read"]()}{" "}
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
						<span className="shrink-0 text-[var(--resume-fg-muted)] text-xs tabular-nums sm:text-sm">
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
							<p className="truncate text-[0.8125rem] text-[var(--resume-fg-muted)] tabular-nums sm:text-sm">
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
