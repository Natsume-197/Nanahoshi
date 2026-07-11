import { BookOpen, CircleNotch, Play } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type CSSProperties, memo, useCallback, useRef } from "react";
import {
	usePlayAudiobook,
	usePrefetchAudiobook,
} from "@/components/audio-player/use-play-audiobook";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { useIsAudiobookLoading } from "@/context/audio-player-context";
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
	"w-[23rem] min-w-[23rem] sm:w-[25rem] sm:min-w-[25rem] lg:w-[28rem] lg:min-w-[28rem]";

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
	lastActivityAt?: string | null;
	/** Audiobooks only: current playback position, in seconds. */
	positionSeconds?: number | null;
	/** Audiobooks only: total duration, in seconds. */
	totalSeconds?: number | null;
	mediaType?: "ebook" | "audiobook";
	priority?: boolean;
}

/**
 * Wide variant of the media tile for the Continue reading/listening rows:
 * same visual vocabulary as BookCardShell (borderless, hover tint, hover
 * resume button and progress bar on the cover) but laid out horizontally
 * with resume metadata (percent, exact position, time spent, last opened)
 * beside the cover.
 */
export const ResumeCard = memo(function ResumeCard({
	uuid,
	title,
	filename,
	cover,
	authors,
	mainColor,
	progress,
	lastActivityAt,
	positionSeconds,
	totalSeconds,
	mediaType,
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

	const positionText =
		isAudiobook &&
		positionSeconds != null &&
		totalSeconds != null &&
		totalSeconds > 0
			? `${formatTime(positionSeconds)} / ${formatTime(totalSeconds)}`
			: null;
	const relativeText = lastActivityAt
		? formatRelativeTime(lastActivityAt)
		: null;

	return (
		<div
			className={cn(
				"group relative isolate flex shrink-0 gap-3 rounded-md p-2",
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
				className="pointer-events-none absolute inset-0 -z-10 rounded-md bg-foreground/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
			/>
			<Link
				{...detailLinkProps}
				aria-label={displayTitle}
				onMouseEnter={preloadOnIntent}
				className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
			/>
			<div
				className={cn(
					"pointer-events-none relative shrink-0 overflow-hidden rounded-md bg-muted",
					isAudiobook ? "size-[12rem]" : "h-[12rem] w-[8rem]",
				)}
			>
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, 240)}
						srcSet={getCoverSrcSet(
							coverFilename,
							coverPresets.thumbnail.widths,
						)}
						sizes={isAudiobook ? "192px" : "128px"}
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
				{progress > 0 && (
					<div
						className="absolute inset-x-0 bottom-0 h-1 bg-black/30"
						role="progressbar"
						aria-label={`${
							isAudiobook
								? m["aria.listening_progress"]()
								: m["aria.reading_progress"]()
						}: ${progress}%`}
						aria-valuenow={progress}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<div
							className="h-full bg-primary transition-all"
							style={{ width: `${progress}%` }}
						/>
					</div>
				)}
			</div>
			<div className="pointer-events-none flex min-w-0 flex-1 flex-col py-0.5">
				<p className="line-clamp-2 font-medium text-base leading-relaxed">
					{displayTitle}
				</p>
				{authors && authors.length > 0 && (
					<AuthorLinkList
						authors={authors}
						className="pointer-events-auto relative z-10 line-clamp-1 text-muted-foreground text-sm leading-relaxed [&>span]:inline"
						linkClassName="transition-colors hover:text-foreground"
					/>
				)}
				<div className="mt-auto space-y-0.5 text-sm leading-relaxed">
					<p className="truncate font-medium">{`${progress}%`}</p>
					{positionText && (
						<p className="truncate text-muted-foreground tabular-nums">
							{positionText}
						</p>
					)}
					{relativeText && (
						<p className="truncate text-muted-foreground">{relativeText}</p>
					)}
				</div>
			</div>
			<div className="pointer-events-auto absolute right-3 bottom-3 z-20 translate-y-3 opacity-0 transition-[opacity,translate] duration-300 focus-within:translate-y-0 focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100">
				{isAudiobook ? (
					<button
						type="button"
						onClick={() => playAudiobook(uuid)}
						onPointerEnter={() => prefetchAudiobook(uuid)}
						onFocus={() => prefetchAudiobook(uuid)}
						disabled={isLoadingPlayback}
						aria-label={m["aria.listen_to"]({ title: displayTitle })}
						aria-busy={isLoadingPlayback}
						className="relative z-10 flex size-11 cursor-pointer items-center justify-center rounded-full bg-media-action shadow-black/30 shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95 disabled:cursor-default disabled:hover:scale-100"
					>
						{isLoadingPlayback ? (
							<CircleNotch className="size-[1.125rem] animate-spin text-media-action-foreground" />
						) : (
							<Play className="size-[1.125rem] text-media-action-foreground" />
						)}
					</button>
				) : (
					<Link
						to="/reader/$uuid"
						params={{ uuid }}
						aria-label={m["aria.read_book"]({ title: displayTitle })}
						className="relative z-10 flex size-11 items-center justify-center rounded-full bg-media-action shadow-black/30 shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95"
					>
						<BookOpen className="size-[1.125rem] text-media-action-foreground" />
					</Link>
				)}
			</div>
		</div>
	);
});
