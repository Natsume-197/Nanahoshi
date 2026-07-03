import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { useInVirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	type CoverPreset,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";

/**
 * Minimal structural shape for the overlay link target. Kept loose on purpose:
 * TanStack's `Link` props are strictly generic over the route tree, which makes
 * a stored/forwarded value awkward to type. We validate the essentials here and
 * cast to the real `Link` props at the single spread site below.
 */
interface CardLinkProps {
	to: string;
	params?: Record<string, string>;
	preload?: "intent" | "viewport" | "render" | false;
}

interface BookCardShellProps {
	/** Navigation props for the full-card overlay link (to / params / preload). */
	linkProps: CardLinkProps;
	ariaLabel: string;
	onLinkMouseEnter?: () => void;
	/** Cover image filename (already stripped of any path). */
	coverFilename?: string;
	coverPreset: CoverPreset;
	/** Square covers (audiobooks) use object-cover; otherwise a 2/3 book ratio. */
	square?: boolean;
	priority?: boolean;
	/** Rendered when there is no cover. Defaults to a "No cover" placeholder. */
	fallback?: ReactNode;
	/** Overlay rendered inside the cover frame (e.g. a download/listen button). */
	overlay?: ReactNode;
	/**
	 * Decoration rendered inside the cover frame BEHIND the image (e.g. offset
	 * "stack" panels that make a series read as a collection). Painted first, so
	 * it only shows where it peeks past the cover's edges.
	 */
	coverBackdrop?: ReactNode;
	progress?: number | null;
	/** Accessible label for the progress bar (e.g. "Reading"/"Listening"). */
	progressLabel?: string;
	title: ReactNode;
	subtitle?: ReactNode;
	/** Number of subtitle rows to reserve space for (e.g. count + author). */
	subtitleLines?: 1 | 2;
}

type BookCardShellRowHeightEstimateOptions = {
	square?: boolean;
	subtitleLines?: 1 | 2;
};

type BookCardShellRowHeightEstimateInput =
	BookCardShellRowHeightEstimateOptions & {
		columnWidth: number;
	};

const CARD_INLINE_PADDING_PX = 16;
const CARD_BLOCK_PADDING_PX = 16;
const CARD_COVER_TEXT_GAP_PX = 12;
const TEXT_BLOCK_HEIGHT_PX_BY_LINES = {
	1: 79,
	2: 104,
} as const;

export function estimateBookCardShellRowHeight({
	columnWidth,
	square = false,
	subtitleLines = 1,
}: BookCardShellRowHeightEstimateInput): number {
	const coverWidth = Math.max(0, columnWidth - CARD_INLINE_PADDING_PX);
	const coverHeight = square ? coverWidth : coverWidth * 1.5;
	return Math.ceil(
		CARD_BLOCK_PADDING_PX +
			coverHeight +
			CARD_COVER_TEXT_GAP_PX +
			TEXT_BLOCK_HEIGHT_PX_BY_LINES[subtitleLines],
	);
}

export function createBookCardShellRowHeightEstimator(
	options: BookCardShellRowHeightEstimateOptions = {},
) {
	return ({ columnWidth }: { columnWidth: number }) =>
		estimateBookCardShellRowHeight({ columnWidth, ...options });
}

function DefaultNoCover() {
	return (
		<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
			{m["book.no_cover"]()}
		</div>
	);
}

/**
 * Shared visual shell for media tiles (books, audiobooks, series). Owns the
 * cover frame, hover/active motion, the full-card overlay link, and the
 * title/subtitle layout so every tile looks identical. Callers supply the
 * navigation target, cover, optional overlay/progress, and the text content.
 */
export function BookCardShell({
	linkProps,
	ariaLabel,
	onLinkMouseEnter,
	coverFilename,
	coverPreset,
	square = false,
	priority = false,
	fallback,
	overlay,
	coverBackdrop,
	progress,
	progressLabel = m["aria.reading_progress"](),
	title,
	subtitle,
	subtitleLines = 1,
}: BookCardShellProps) {
	const inVirtualizedGrid = useInVirtualizedCardGrid();
	const resolvedLinkProps =
		inVirtualizedGrid &&
		(linkProps.preload === undefined || linkProps.preload === "intent")
			? { ...linkProps, preload: false as const }
			: linkProps;

	// The cover frame is pointer-events-none so clicks fall through to the overlay
	// Link beneath; the overlay (download/listen) re-enables pointer events itself.
	const coverFrame = (
		<div
			className={cn(
				"pointer-events-none relative isolate w-full bg-muted transition-transform duration-500 max-md:group-active:scale-95 max-md:group-active:duration-150",
				square ? "aspect-square rounded-md" : "aspect-[2/3]",
			)}
		>
			{coverBackdrop}
			{coverFilename ? (
				<img
					src={getCoverPresetUrl(coverFilename, coverPreset)}
					srcSet={getCoverSrcSet(coverFilename, coverPreset.widths)}
					sizes={coverPreset.sizes}
					alt=""
					className={cn(
						"h-full w-full rounded-md opacity-0 transition-opacity duration-500 ease-out",
						square ? "object-cover" : "aspect-[2/3]",
					)}
					loading={priority ? "eager" : "lazy"}
					fetchPriority={priority ? "high" : "auto"}
					decoding="async"
					width={160}
					height={square ? 160 : 240}
					onLoad={(e) => {
						e.currentTarget.classList.remove("opacity-0");
					}}
					ref={(el) => {
						if (el?.complete) el.classList.remove("opacity-0");
					}}
				/>
			) : (
				(fallback ?? <DefaultNoCover />)
			)}
			{overlay}
			{progress != null && progress > 0 && (
				<div
					className="absolute inset-x-0 bottom-0 h-1 bg-black/30"
					role="progressbar"
					aria-label={`${progressLabel}: ${progress}%`}
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
	);

	return (
		<div
			className={cn(
				"group relative flex flex-col gap-3 rounded-md p-2 transition-colors duration-200 hover:bg-muted has-[:focus-visible]:bg-muted",
			)}
		>
			<Link
				{...(resolvedLinkProps as ComponentProps<typeof Link>)}
				aria-label={ariaLabel}
				className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				onMouseEnter={inVirtualizedGrid ? undefined : onLinkMouseEnter}
			/>
			{coverFrame}
			{/* The text block reserves a fixed height (2-line title + gap + 1-line
			    subtitle) so every tile is the same height and the hover background
			    never changes size. Content is top-aligned, so the subtitle always
			    sits directly under the title and any slack falls at the bottom. */}
			<div
				className={cn(
					"min-w-0 space-y-1 px-0.5",
					subtitleLines === 2 ? "min-h-[6.5rem]" : "min-h-[4.9375rem]",
				)}
			>
				<div className="pointer-events-none">
					<p className="line-clamp-2 font-medium text-base leading-relaxed [&>em]:font-bold [&>em]:text-primary [&>em]:not-italic">
						{title}
					</p>
				</div>
				{subtitle && (
					<div
						className={cn(
							"relative z-10 text-muted-foreground text-sm leading-relaxed",
							subtitleLines === 2
								? "pointer-events-none space-y-0.5"
								: "line-clamp-1 [&>span]:inline",
						)}
					>
						{subtitle}
					</div>
				)}
			</div>
		</div>
	);
}
