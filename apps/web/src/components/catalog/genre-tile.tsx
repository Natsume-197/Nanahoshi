import { Link } from "@tanstack/react-router";
import type { ComponentProps, CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getTintedCardStyle } from "@/utils/color";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";

/** See `BookCardShell` — TanStack's Link props are awkward to forward typed. */
interface GenreTileLinkProps {
	to: string;
	params?: Record<string, string>;
	preload?: "intent" | "viewport" | "render" | false;
}

interface GenreTileProps {
	linkProps: GenreTileLinkProps;
	name: string;
	subtitle?: string;
	/** Representative cover filename (already stripped of any path). */
	coverFilename?: string;
	/** That cover's dominant color (hex) — the same plate the Recent cards use. */
	tint?: string | null;
	/** Native square artwork (audiobooks): reserves the wider slot it needs. */
	square?: boolean;
}

export const GENRE_TILE_ASPECT = 2;
/** Wide tiles need a wider column than a cover, or the name has nowhere to go. */
export const GENRE_TILE_MIN_WIDTH = 260;
export const GENRE_TILE_GAP = 12;

/** Grid sizing for a page of these tiles, for `CollectionView.gridLayout`. */
export const GENRE_TILE_GRID = {
	minTileWidth: GENRE_TILE_MIN_WIDTH,
	minColumns: 1,
	gap: GENRE_TILE_GAP,
} as const;

export function estimateGenreTileRowHeight({
	columnWidth,
}: {
	columnWidth: number;
}): number {
	return Math.ceil(columnWidth / GENRE_TILE_ASPECT);
}

/**
 * Share of the tile's width the artwork takes: it runs the tile's full height,
 * so its width follows from the tile ratio and the artwork's own — a third for
 * a 2:3 cover, half for square audiobook art. Derived, so changing the tile
 * ratio can't leave the name's reserved room behind.
 */
function artworkSlot(square: boolean): string {
	return `${100 / (GENRE_TILE_ASPECT * (square ? 1 : 1.5))}%`;
}

const SKELETON_KEYS = Array.from(
	{ length: 8 },
	(_, i) => `genre-skeleton-${i}`,
);

/** Loading state for a grid of these tiles, in the same shape and columns. */
export function GenreTileSkeletonGrid() {
	return (
		<div
			className="grid"
			style={{
				gap: GENRE_TILE_GAP,
				gridTemplateColumns: `repeat(auto-fill, minmax(${GENRE_TILE_MIN_WIDTH}px, 1fr))`,
			}}
		>
			{SKELETON_KEYS.map((key) => (
				<Skeleton
					key={key}
					className="rounded-xl"
					style={{ aspectRatio: GENRE_TILE_ASPECT }}
				/>
			))}
		</div>
	);
}

/**
 * Wide tile: the name on a plate of the artwork's own color, with the cover
 * standing at full height on the trailing side. Deliberately not a
 * `BookCardShell` — a genre is a place, not a book, so it reads as a banner
 * rather than as an item on a shelf.
 */
export function GenreTile({
	linkProps,
	name,
	subtitle,
	coverFilename,
	tint,
	square = false,
}: GenreTileProps) {
	return (
		<div
			data-slot="genre-tile"
			className="group relative isolate w-full overflow-hidden rounded-xl bg-surface-card"
			style={
				{
					aspectRatio: GENRE_TILE_ASPECT,
					// No cover: the name gets the whole plate, with no reserved gap.
					"--artwork-slot": coverFilename ? artworkSlot(square) : "0px",
					...getTintedCardStyle(tint),
				} as CSSProperties
			}
		>
			<Link
				{...(linkProps as ComponentProps<typeof Link>)}
				aria-label={name}
				className="absolute inset-0 z-20 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-current focus-visible:-outline-offset-2"
			/>
			{coverFilename && (
				<img
					src={getCoverPresetUrl(coverFilename, coverPresets.facetTile)}
					srcSet={getCoverSrcSet(coverFilename, coverPresets.facetTile.widths)}
					sizes={coverPresets.facetTile.sizes}
					alt=""
					loading="lazy"
					decoding="async"
					width={square ? 240 : 160}
					height={240}
					// Inset on top and on the trailing side but flush with the bottom:
					// the cover stands on the tile's base rather than being framed by
					// it. Height-driven with `w-auto`, so the artwork is never cropped;
					// `max-w` only guards pathologically wide art, which then letterboxes
					// against the plate instead. Absolute (with an explicit height — a
					// replaced element ignores stretched insets), or its own height
					// would size the tile and break the ratio the virtualized row
					// height is computed from.
					className="absolute end-3 top-3 h-[calc(100%-0.75rem)] w-auto max-w-[var(--artwork-slot)] object-contain object-bottom"
				/>
			)}
			<div className="relative z-10 flex h-full min-w-0 flex-col gap-0.5 p-5 pe-[calc(var(--artwork-slot)+1.25rem)]">
				<p className="line-clamp-2 text-pretty font-bold text-base leading-tight sm:text-lg">
					{name}
				</p>
				{subtitle && (
					<p className="truncate text-sm tabular-nums opacity-70">{subtitle}</p>
				)}
			</div>
			{/* Hover as an opacity fade on a premounted layer, as on the book cards:
			    transitioning the plate color would recalc + repaint every frame. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 z-10 bg-white/10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-150"
			/>
		</div>
	);
}
