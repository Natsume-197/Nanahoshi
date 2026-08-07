import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { useInSweepScroll } from "@/components/shared/sweep-scroll-context";
import { useInVirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { useHideCardText } from "@/hooks/use-card-display-preferences";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getMutedAccentSurfaceColor, getTintedCardStyle } from "@/utils/color";
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
	/** Replaces detail navigation with an immediate card action (e.g. play). */
	onCardAction?: () => void;
	/** Accessible name for an immediate card action. */
	cardActionAriaLabel?: string;
	/** Makes the full card its only interactive target. */
	fullCardAction?: boolean;
	/** Cover image filename (already stripped of any path). */
	coverFilename?: string;
	coverPreset: CoverPreset;
	/**
	 * Marks native square artwork such as an audiobook cover. Mixed rows center
	 * it on a flat plate of its own dominant color inside the shared 2/3 frame.
	 */
	square?: boolean;
	/**
	 * Use the artwork's native square frame when every item in a carousel is
	 * square. Keep the default book frame for mixed-format rows.
	 */
	coverFrameRatio?: "book" | "square";
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

/**
 * Dashboard rails run these tiles ~150px wide on phones, where an 18px title
 * clamps almost every book to two cut lines and sits level with the 20px
 * section heading beside it. Step it down below md.
 */
const COMPACT_TITLE_CLASS = "text-base leading-snug md:text-lg";
const HORIZONTAL_TITLE_CLASS = "font-semibold text-[0.8125rem] leading-tight";
/**
 * A floor, not a fixed height: a card with no author, or a title that fits on
 * one line, is meant to end where its content ends instead of holding an empty
 * line open. Rows still line up on the top edge, which is the one that reads.
 */
export const COMPACT_TEXT_BLOCK_CLASS = {
	1: "min-h-16",
	2: "min-h-20",
} as const;

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
	// A grid of nothing but square artwork uses the artwork's own frame, so its
	// rows are a third shorter than a shelf of 2/3 books.
	const coverHeight = coverWidth * (square ? 1 : 1.5);
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
	onCardAction,
	cardActionAriaLabel,
	fullCardAction = false,
	coverFilename,
	coverPreset,
	square = false,
	coverFrameRatio = "book",
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
	const [hideCardText] = useHideCardText();
	const hidesTextBlock = hideCardText && !isHorizontal;
	const hasImmediateCardAction = onCardAction !== undefined || fullCardAction;
	// Virtualized grids AND horizontal carousels both sweep cards under a
	// stationary cursor during scroll. In either, hover intent still preloads the
	// detail route — but only after a deliberate dwell, so a card merely passing
	// beneath the scrolling cursor doesn't fire a preload + cover download each
	// (the storm that janked the dashboard). The router cancels the timer when the
	// pointer leaves early, so a real hover still prefetches.
	const inVirtualizedGrid = useInVirtualizedCardGrid();
	const inCarousel = useInSweepScroll();
	const inSweepScroll = inVirtualizedGrid || inCarousel;
	const resolvedLinkProps =
		inSweepScroll &&
		(linkProps.preload === undefined || linkProps.preload === "intent")
			? { ...linkProps, preload: "intent" as const, preloadDelay: 200 }
			: linkProps;
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPreset)
		: undefined;
	const usesSquareCoverFrame =
		square && !isHorizontal && coverFrameRatio === "square";
	// Square artwork in a mixed row keeps the 2/3 frame, so it letterboxes. The
	// bands are a flat mat in the artwork's own color rather than a blown-up blur
	// of it: mixed into the theme surface, so it stays quiet and reads as matting
	// in both themes instead of as muddy filler.
	const showSquareArtworkPlate =
		square && !isHorizontal && !usesSquareCoverFrame && coverUrl !== undefined;
	// While a cover loads, tint its frame with the artwork's own dominant color
	// (muted toward the surface — never raw) instead of a flat gray, so the reveal
	// is color→image and a dense grid doesn't flash gray as rows recycle. The
	// image covers the frame once loaded, so this only shows during the fade.
	const coverPlaceholderColor =
		!isHorizontal && tint ? getMutedAccentSurfaceColor(tint) : undefined;
	const coverFrameColor =
		showSquareArtworkPlate && tint
			? `color-mix(in oklab, ${tint} 22%, var(--muted))`
			: coverPlaceholderColor;

	// The cover frame is pointer-events-none so clicks fall through to the card
	// action beneath; the optional cover overlay re-enables pointer events itself.
	const coverFrame = (
		<div
			data-slot="book-card-cover"
			className={cn(
				"pointer-events-none relative isolate motion-safe:transition-transform motion-safe:duration-[var(--duration-quick)] motion-safe:ease-[var(--ease-smooth-out)]",
				// Horizontal cards give every cover the same square slot: every ratio
				// fills it top to bottom (a square audiobook fills it entirely), and
				// because the widest case sets the slot width, a narrower 2:3 book
				// never shifts the text column of its card against the rest.
				isHorizontal
					? "flex size-16 shrink-0 items-center justify-start sm:size-[4.25rem]"
					: cn(
							"flex w-full items-center justify-center rounded-md bg-muted",
							usesSquareCoverFrame ? "aspect-square" : "aspect-[2/3]",
						),
			)}
			style={coverFrameColor ? { backgroundColor: coverFrameColor } : undefined}
		>
			{coverBackdrop}
			{!isHorizontal && overlay}
			{coverFilename ? (
				<img
					src={coverUrl}
					srcSet={getCoverSrcSet(coverFilename, coverPreset.widths)}
					sizes={coverPreset.sizes}
					alt=""
					className={cn(
						"scale-[0.985] rounded-md opacity-0 shadow-black/25 shadow-lg outline outline-1 outline-[var(--image-outline)] -outline-offset-1 motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-[var(--ease-smooth-out)]",
						// Height-driven: the artwork keeps its own ratio and the shadow
						// traces the cover itself, never empty slot. A lifted cover rather
						// than an outlined one — the card already supplies the edge, and
						// the shadow is what reads as a physical book.
						isHorizontal
							? cn("h-full", square ? "w-full" : "w-auto")
							: square
								? cn(
										"relative z-[1] aspect-square w-full object-cover",
										usesSquareCoverFrame ? "h-full" : "h-auto",
									)
								: "aspect-[2/3] h-full w-full",
					)}
					loading={priority ? "eager" : "lazy"}
					fetchPriority={priority ? "high" : "auto"}
					decoding="async"
					width={160}
					height={square ? 160 : 240}
					onLoad={(e) => {
						e.currentTarget.classList.remove("opacity-0", "scale-[0.985]");
					}}
					ref={(el) => {
						// Already-cached covers (common as virtualized rows recycle) resolve
						// synchronously — reveal them instantly, with no fade or scale, so
						// fast scrolling never flashes a grid of re-animating tiles.
						if (el?.complete) el.classList.remove("opacity-0", "scale-[0.985]");
					}}
				/>
			) : (
				(fallback ?? <DefaultNoCover />)
			)}
			{/* Horizontal cards stay bare: a hairline over artwork is unreadable at
			    their cover size, and the rail reads as a shelf, not a dashboard. */}
			{!isHorizontal && progress != null && progress > 0 && (
				<div
					className="absolute inset-x-0 bottom-0 z-10 h-1 bg-[var(--progress-track)]"
					role="progressbar"
					aria-label={`${progressLabel}: ${progress}%`}
					aria-valuenow={progress}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<div
						className="h-full bg-[var(--progress-indicator)] motion-safe:transition-[width]"
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
				"group relative isolate flex",
				// Top-aligned: covers of different aspect ratios sit in one row, so
				// their shared top edge is the only one that holds. Slack falls to
				// the bottom, as it does under a vertical card. h-full makes every
				// card in the rail take the row height, so a square audiobook and a
				// 2:3 book are the same size.
				isHorizontal
					? "h-full items-center gap-2.5 rounded-2xl bg-card p-2.5 shadow-card hover:shadow-card-hover motion-safe:transition-[box-shadow] motion-safe:duration-150 motion-safe:ease-out"
					: cn("flex-col", hidesTextBlock ? "gap-0" : "gap-3"),
			)}
			// The stronger cover color is the defining surface of the compact Recent
			// card. Mixing in oklab keeps the hue stable while leaving enough of the
			// theme surface to make neighboring cards feel related.
			style={isHorizontal ? getTintedCardStyle(tint) : undefined}
		>
			{/* Hover tint as an opacity fade on a premounted layer: opacity composites
			    off the main thread, while transitioning background-color would
			    style-recalc + paint every frame as cards sweep under the cursor.
			    -z-10 (scoped by isolate) keeps it behind the static text content. */}
			<div
				aria-hidden
				className={cn(
					"pointer-events-none absolute -z-10 rounded-2xl opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 motion-safe:transition-opacity",
					isHorizontal
						? "inset-0 bg-white/10 duration-150"
						: // The fill grows OUTWARD instead of the card gaining padding, so
							// it reads as a padded card while the cover itself still starts
							// exactly on the section heading's line. Bounded by two things:
							// half the smallest neighbouring gap (12px rails / 16px grids),
							// so a hovered card never tints the cover beside it, and the
							// rail's own py-1/md:py-2, which clips anything taller.
							"-inset-x-1.5 -inset-y-1 bg-surface-hover duration-200 md:-inset-2",
				)}
			/>
			{onCardAction ? (
				<button
					type="button"
					onClick={onCardAction}
					onPointerEnter={onLinkMouseEnter}
					onFocus={onLinkMouseEnter}
					aria-label={cardActionAriaLabel ?? ariaLabel}
					className={cn(
						"absolute inset-0 z-0 cursor-pointer",
						isHorizontal
							? "rounded-2xl focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
							: "rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					)}
				/>
			) : (
				<Link
					{...(resolvedLinkProps as ComponentProps<typeof Link>)}
					aria-label={ariaLabel}
					className={cn(
						"absolute inset-0 z-0 cursor-pointer",
						isHorizontal
							? "rounded-2xl focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
							: "rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					)}
					onMouseEnter={inSweepScroll ? undefined : onLinkMouseEnter}
				/>
			)}
			{coverFrame}
			{/* Hover action button at the bottom-right corner of horizontal cards. */}
			{isHorizontal && overlay}
			{/* The text block reserves a fixed height (2-line title + gap + 1-line
			    subtitle) so every tile is the same height and the hover background
			    never changes size. Content is top-aligned, so the subtitle always
			    sits directly under the title and any slack falls at the bottom. */}
			<div
				className={cn(
					"flex min-w-0 flex-col gap-1 px-0.5",
					hidesTextBlock && "hidden",
					hasImmediateCardAction && "pointer-events-none",
					isHorizontal
						? "flex-1 gap-0.5 pe-2"
						: compactTextBlock
							? COMPACT_TEXT_BLOCK_CLASS[subtitleLines]
							: subtitleLines === 2
								? "min-h-[6.5rem]"
								: "min-h-[4.9375rem]",
				)}
			>
				{hasImmediateCardAction ? (
					<p
						className={cn(
							"line-clamp-2 font-medium [&>em]:font-bold [&>em]:text-primary [&>em]:not-italic",
							isHorizontal
								? HORIZONTAL_TITLE_CLASS
								: compactTextBlock
									? COMPACT_TITLE_CLASS
									: "text-base leading-relaxed",
						)}
					>
						{title}
					</p>
				) : (
					<Link
						{...(resolvedLinkProps as ComponentProps<typeof Link>)}
						title={ariaLabel}
						tabIndex={-1}
						className="pointer-events-auto relative z-10 block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
						onMouseEnter={inSweepScroll ? undefined : onLinkMouseEnter}
					>
						<p
							className={cn(
								"line-clamp-2 font-medium [&>em]:font-bold [&>em]:text-primary [&>em]:not-italic",
								isHorizontal
									? HORIZONTAL_TITLE_CLASS
									: compactTextBlock
										? COMPACT_TITLE_CLASS
										: "text-base leading-relaxed",
							)}
						>
							{title}
						</p>
					</Link>
				)}
				{subtitle && (
					<div
						className={cn(
							"relative z-10 leading-relaxed",
							isHorizontal
								? "text-current text-xs"
								: "text-muted-foreground text-sm",
							subtitleLines === 2
								? "pointer-events-none flex flex-col gap-0.5"
								: "line-clamp-1 [&>span]:inline",
						)}
					>
						{subtitle}
					</div>
				)}
				{isHorizontal && meta && (
					<p className="relative z-10 text-pretty text-current text-xs tabular-nums leading-normal">
						{meta}
					</p>
				)}
			</div>
		</div>
	);
}
