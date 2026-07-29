import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { useInVirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getMutedAccentSurfaceColor } from "@/utils/color";
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
	/** Use the shorter text reservation used by dashboard carousel tiles. */
	compactTextBlock?: boolean;
	/**
	 * "horizontal" unfolds the same card sideways — cover at its usual scale,
	 * text beside it instead of beneath — so a row of two or three items still
	 * fills the panel. Used by the home resume rail.
	 */
	orientation?: "vertical" | "horizontal";
	/** Extra muted line under the subtitle. Horizontal orientation only. */
	meta?: ReactNode;
	/**
	 * Cover's dominant color (hex). Colors the compact horizontal card and
	 * chooses a contrast-safe foreground. Vertical tiles sit directly on the
	 * page and do not use it.
	 */
	tint?: string | null;
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
	compactTextBlock = false,
	orientation = "vertical",
	meta,
	tint,
}: BookCardShellProps) {
	const isHorizontal = orientation === "horizontal";
	const inVirtualizedGrid = useInVirtualizedCardGrid();
	// In virtualized grids, hover intent still preloads the detail route — but
	// only after a deliberate dwell, so cards sweeping under a scrolling cursor
	// don't fire a preload each (the reason preload used to be fully disabled
	// here). The router cancels the timer when the pointer leaves early.
	const resolvedLinkProps =
		inVirtualizedGrid &&
		(linkProps.preload === undefined || linkProps.preload === "intent")
			? { ...linkProps, preload: "intent" as const, preloadDelay: 200 }
			: linkProps;

	// The cover frame is pointer-events-none so clicks fall through to the overlay
	// Link beneath; the overlay (download/listen) re-enables pointer events itself.
	const coverFrame = (
		<div
			data-slot="book-card-cover"
			className={cn(
				"pointer-events-none relative isolate transition-transform duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]",
				// Horizontal cards give every cover the same square slot: every ratio
				// fills it top to bottom (a square audiobook fills it entirely), and
				// because the widest case sets the slot width, a narrower 2:3 book
				// never shifts the text column of its card against the rest.
				isHorizontal
					? "flex size-16 shrink-0 items-center justify-start sm:size-[4.25rem]"
					: cn(
							"w-full bg-muted",
							square ? "aspect-square rounded-md" : "aspect-[2/3]",
						),
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
						"rounded-md opacity-0 shadow-black/25 shadow-lg transition-opacity duration-500 ease-out",
						// Height-driven: the artwork keeps its own ratio and the shadow
						// traces the cover itself, never empty slot. A lifted cover rather
						// than an outlined one — the card already supplies the edge, and
						// the shadow is what reads as a physical book.
						isHorizontal
							? cn("h-full", square ? "w-full" : "w-auto")
							: cn("h-full w-full", square ? "object-cover" : "aspect-[2/3]"),
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
			{/* Horizontal cards stay bare: a hairline over artwork is unreadable at
			    their cover size, and the rail reads as a shelf, not a dashboard. */}
			{!isHorizontal && progress != null && progress > 0 && (
				<div
					className="absolute inset-x-0 bottom-0 h-1 bg-black/30"
					role="progressbar"
					aria-label={`${progressLabel}: ${progress}%`}
					aria-valuenow={progress}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						className="h-full bg-primary transition-[width] motion-reduce:transition-none"
						style={{ width: `${progress}%` }}
					/>
				</div>
			)}
		</div>
	);

	return (
		<div
			data-slot="book-card-shell"
			className={cn(
				"group relative isolate flex rounded-md",
				// Top-aligned: covers of different aspect ratios sit in one row, so
				// their shared top edge is the only one that holds. Slack falls to
				// the bottom, as it does under a vertical card. h-full makes every
				// card in the rail take the row height, so a square audiobook and a
				// 2:3 book are the same size.
				isHorizontal
					? "h-full items-center gap-2.5 rounded-lg bg-card p-2.5 shadow-card ring-1 ring-black/5"
					: "flex-col gap-3",
			)}
			// The stronger cover color is the defining surface of the compact Recent
			// card. Mixing in oklab keeps the hue stable while leaving enough of the
			// theme surface to make neighboring cards feel related.
			style={
				isHorizontal && tint
					? {
							backgroundColor: getMutedAccentSurfaceColor(tint) ?? undefined,
							color: "oklch(1 0 0)",
						}
					: undefined
			}
		>
			{/* Hover tint as an opacity fade on a premounted layer: opacity composites
			    off the main thread, while transitioning background-color would
			    style-recalc + paint every frame as cards sweep under the cursor.
			    -z-10 (scoped by isolate) keeps it behind the static text content. */}
			<div
				aria-hidden
				className={cn(
					"pointer-events-none absolute inset-0 -z-10 rounded-md opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
					isHorizontal ? "bg-white/10" : "bg-surface-hover",
					isHorizontal ? "duration-150" : "duration-200",
				)}
			/>
			<Link
				{...(resolvedLinkProps as ComponentProps<typeof Link>)}
				aria-label={ariaLabel}
				className={cn(
					"absolute inset-0 z-0 rounded-md",
					isHorizontal
						? "focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
						: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				)}
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
					isHorizontal
						? "flex-1 space-y-0.5 pe-2"
						: compactTextBlock
							? subtitleLines === 2
								? "min-h-20"
								: "min-h-16"
							: subtitleLines === 2
								? "min-h-[6.5rem]"
								: "min-h-[4.9375rem]",
				)}
			>
				<Link
					{...(resolvedLinkProps as ComponentProps<typeof Link>)}
					title={ariaLabel}
					tabIndex={-1}
					className="pointer-events-auto relative z-10 block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					onMouseEnter={inVirtualizedGrid ? undefined : onLinkMouseEnter}
				>
					<p
						className={cn(
							"line-clamp-2 font-medium [&>em]:font-bold [&>em]:text-primary [&>em]:not-italic",
							isHorizontal
								? // Two lines are always reserved (2 × leading-snug) so the
									// progress bars below line up across the rail — comparing
									// them at a glance is the point of a resume row.
									"font-semibold text-[0.8125rem] leading-tight"
								: compactTextBlock
									? "text-lg leading-snug"
									: "text-base leading-relaxed",
						)}
					>
						{title}
					</p>
				</Link>
				{subtitle && (
					<div
						className={cn(
							"relative z-10 leading-relaxed",
							isHorizontal
								? "text-[0.6875rem] text-current"
								: "text-muted-foreground text-sm",
							subtitleLines === 2
								? "pointer-events-none space-y-0.5"
								: "line-clamp-1 [&>span]:inline",
						)}
					>
						{subtitle}
					</div>
				)}
				{isHorizontal && meta && (
					<p className="relative z-10 text-pretty text-[0.6875rem] text-current leading-normal">
						{meta}
					</p>
				)}
			</div>
		</div>
	);
}
