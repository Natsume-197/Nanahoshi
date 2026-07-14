import { CaretDown } from "@phosphor-icons/react";
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
import {
	formatDurationLong,
	formatRelativeTime,
	formatTime,
} from "@/utils/format";

/** Width of a resume card inside the continue reading/listening carousels. */
export const RESUME_CARD_WIDTH_CLASS =
	"w-[calc(100vw-2rem)] min-w-[calc(100vw-2rem)] max-w-[21rem] sm:w-[28.5rem] sm:min-w-[28.5rem] sm:max-w-none lg:w-[34rem] lg:min-w-[34rem]";

/** Netflix-like secondary action that opens the media detail page. */
const DETAILS_BUTTON_CLASS =
	"pointer-events-auto flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white  backdrop-blur-md transition-transform hover:scale-110 hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 active:scale-95 sm:size-10";

interface ResumeCardProps {
	uuid: string;
	title?: string | null;
	filename: string;
	cover: string | null;
	authors?: { uuid?: string | null; name: string; role?: string | null }[];
	/** Dominant cover color; tints the card background. */
	mainColor?: string | null;
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

/** Bold "remaining" headline over a muted exact-position line. */
function StatusText({
	primary,
	secondary,
	playing = false,
}: {
	primary: string;
	secondary: string | null;
	playing?: boolean;
}) {
	return (
		<div className="min-w-0 flex-1">
			<p className="flex items-center gap-1.5 truncate font-semibold text-[0.8125rem] sm:text-sm">
				{playing && <PlayingIndicator />}
				<span className="truncate">{primary}</span>
			</p>
			{secondary && (
				<p className="truncate text-[0.6875rem] text-muted-foreground tabular-nums max-[340px]:hidden sm:text-xs">
					{secondary}
				</p>
			)}
		</div>
	);
}

function EbookStatus({
	progress,
	exploredCharCount,
	bookCharCount,
}: {
	progress: number;
	exploredCharCount?: number | null;
	bookCharCount?: number | null;
}) {
	const remaining = Math.max(0, 100 - Math.round(progress));
	const secondary =
		exploredCharCount != null && bookCharCount != null
			? `${exploredCharCount.toLocaleString()} / ${bookCharCount.toLocaleString()} ${m["book.characters"]().toLowerCase()}`
			: null;
	return (
		<StatusText
			primary={m["home.remaining_percent"]({ percent: remaining })}
			secondary={secondary}
		/>
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
	const remaining = Math.max(0, liveDuration - livePosition);
	return (
		<StatusText
			primary={m["home.remaining_time"]({
				time: formatDurationLong(remaining),
			})}
			secondary={`${formatTime(livePosition)} / ${formatTime(liveDuration)}`}
			playing={isActive && isPlaying}
		/>
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
	mainColor,
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
				"group relative isolate flex h-[10.75rem] shrink-0 gap-3 overflow-hidden rounded-xl p-1.5 pb-2.5 sm:h-[14rem] sm:gap-5 sm:p-3 sm:pb-3.5",
				!mainColor && "bg-muted",
				RESUME_CARD_WIDTH_CLASS,
			)}
			style={
				mainColor
					? ({
							"--resume-accent": mainColor,
							// Ambient wash that blooms from the cover side and fades toward
							// the text — the detail-page hero wash, scaled down. oklab keeps
							// the tint's hue honest at low percentages.
							background:
								"radial-gradient(120% 140% at 0% 50%, color-mix(in oklab, var(--resume-accent) 44%, var(--card)), color-mix(in oklab, var(--resume-accent) 16%, var(--card)) 72%)",
						} as CSSProperties)
					: undefined
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
					"pointer-events-none relative h-full shrink-0 overflow-hidden rounded-lg bg-muted shadow-sm",
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
			<div className="pointer-events-none flex min-w-0 flex-1 flex-col overflow-hidden py-0.5">
				<p className="line-clamp-2 font-semibold text-[0.9375rem] leading-snug sm:text-lg">
					{displayTitle}
				</p>
				{authors && authors.length > 0 && (
					<AuthorLinkList
						authors={authors}
						className="pointer-events-auto relative z-10 mt-0.5 line-clamp-1 text-muted-foreground text-xs sm:mt-1 sm:text-sm [&>span]:inline"
						linkClassName="transition-colors hover:text-foreground"
					/>
				)}
				{lastActivityAt && (
					<p className="mt-0.5 truncate text-muted-foreground text-xs sm:mt-1 sm:text-sm">
						{isAudiobook
							? m["home.resume_last_listened"]()
							: m["home.resume_last_read"]()}{" "}
						{formatRelativeTime(lastActivityAt)}
					</p>
				)}
				<div className="mt-auto space-y-2.5 pt-2 sm:space-y-3 sm:pt-3">
					<div className="h-1 overflow-hidden rounded-full bg-foreground/15">
						<div
							className="h-full rounded-full bg-primary/80"
							style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
						/>
					</div>
					<div className="flex items-center gap-2.5 pr-10 sm:gap-4 sm:pr-12">
						{isAudiobook ? (
							<AudiobookStatus
								uuid={uuid}
								positionSeconds={positionSeconds}
								totalSeconds={totalSeconds}
							/>
						) : (
							<EbookStatus
								progress={progress}
								exploredCharCount={exploredCharCount}
								bookCharCount={bookCharCount}
							/>
						)}
					</div>
				</div>
			</div>
			<div className="pointer-events-auto absolute right-1.5 bottom-2.5 z-20 opacity-100 sm:right-3 sm:bottom-3.5 md:translate-y-3 md:opacity-0 md:transition-[opacity,translate] md:duration-300 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:focus-within:translate-y-0 md:focus-within:opacity-100">
				<Link
					{...detailLinkProps}
					aria-label={`${m["home.hero_view_details"]()}: ${displayTitle}`}
					onMouseEnter={preloadOnIntent}
					className={DETAILS_BUTTON_CLASS}
				>
					<CaretDown className="size-[1.125rem] sm:size-5" weight="bold" />
				</Link>
			</div>
		</div>
	);
});
