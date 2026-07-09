import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { useInVirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getCoverUrl } from "@/utils/covers";
import { formatNames } from "@/utils/format";

type Author = { id?: number | null; name: string };

/**
 * Loose link shape — TanStack's `Link` props are strictly generic over the
 * route tree, so we keep this minimal and cast at the single spread site.
 */
interface RowLinkProps {
	to: string;
	params?: Record<string, string>;
	preload?: "intent" | "viewport" | "render" | false;
}

// Shared column template + per-column visibility, used by both the header and
// the rows so they stay pixel-aligned. Columns reveal progressively with width:
//   base → [#] [Title]
//   md   → + Meta (trailing, when present)
//   lg   → + Author (when present)
// DOM order is fixed (#, title, author, meta); each cell hides at the
// breakpoints where its column drops out so the visible cell count always
// matches the active template. The Author and Meta columns are independently
// optional, so the four templates are precomputed and looked up per row.
const BASE_GRID = "grid items-center gap-3 grid-cols-[1.75rem_1fr]";
const ROW_GRID = {
	// [withAuthor][withMeta]
	none: BASE_GRID,
	meta: cn(BASE_GRID, "md:grid-cols-[1.75rem_1fr_6rem]"),
	author: cn(BASE_GRID, "lg:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,14rem)]"),
	both: cn(
		BASE_GRID,
		"md:grid-cols-[1.75rem_1fr_6rem]",
		"lg:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,14rem)_6rem]",
	),
} as const;

function rowGridClass(withAuthor: boolean, withMeta: boolean) {
	if (withAuthor && withMeta) return ROW_GRID.both;
	if (withAuthor) return ROW_GRID.author;
	if (withMeta) return ROW_GRID.meta;
	return ROW_GRID.none;
}

const COL_AUTHOR = "hidden lg:block";
const COL_META = "hidden md:block";

export function CollectionTableHeader({
	authorLabel = m["common.author"](),
	metaLabel,
	withAuthor = true,
}: {
	authorLabel?: string;
	/** Omit to drop the trailing column entirely (rows must also set `withMeta={false}`). */
	metaLabel?: string;
	/** Set false (matching rows) to drop the Author column. */
	withAuthor?: boolean;
}) {
	return (
		<div
			className={cn(
				rowGridClass(withAuthor, metaLabel !== undefined),
				"sticky top-0 z-10 border-border/60 border-b bg-background/80 px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide backdrop-blur",
			)}
		>
			<span className="text-center">#</span>
			<span>{m["common.title"]()}</span>
			{withAuthor ? <span className={COL_AUTHOR}>{authorLabel}</span> : null}
			{metaLabel !== undefined ? (
				<span className={cn(COL_META, "text-right")}>{metaLabel}</span>
			) : null}
		</div>
	);
}

export function CollectionTableRow({
	index,
	linkProps,
	coverFilename,
	coverFallback,
	title,
	subtitle,
	authors,
	meta,
	withAuthor = true,
	withMeta = true,
}: {
	index: number;
	linkProps: RowLinkProps;
	coverFilename?: string | null;
	/** Rendered inside the thumbnail frame when there is no cover. */
	coverFallback?: ReactNode;
	title: string;
	/**
	 * Shown under the title on narrow screens (where the Author column is hidden).
	 * Defaults to the joined author names when `authors` is provided.
	 */
	subtitle?: ReactNode;
	/** Author column content (lg+) and the default narrow-screen subtitle. */
	authors?: Author[] | null;
	/** Trailing right-aligned column (md+): year, date added, count… */
	meta?: ReactNode;
	/** Set false (matching a header with `withAuthor={false}`) to drop the Author column. */
	withAuthor?: boolean;
	/** Set false (matching a header with no `metaLabel`) to drop the trailing column. */
	withMeta?: boolean;
}) {
	const inVirtualizedGrid = useInVirtualizedCardGrid();
	const resolvedLinkProps =
		inVirtualizedGrid &&
		(linkProps.preload === undefined || linkProps.preload === "intent")
			? { ...linkProps, preload: false as const }
			: linkProps;

	const hasAuthors = !!authors?.length;
	const resolvedSubtitle =
		subtitle ?? (hasAuthors ? formatNames(authors) : undefined);

	// Overlay-link layout (mirrors MediaListRow): the full-row Link is an absolute
	// z-0 sibling so author links can sit above it without nesting anchors.
	return (
		<div
			className={cn(
				rowGridClass(withAuthor, withMeta),
				"group relative isolate rounded-lg px-3 py-1.5",
			)}
		>
			{/* Hover tint as an opacity fade (compositor) instead of animating
			    background-color (main-thread recalc + paint per frame).
			    -z-10 (scoped by isolate) keeps it behind the static row content. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-muted opacity-0 transition-opacity group-hover:opacity-100"
			/>
			<Link
				{...(resolvedLinkProps as ComponentProps<typeof Link>)}
				className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
			/>

			<span className="pointer-events-none text-center text-muted-foreground text-sm tabular-nums">
				{index}
			</span>

			<div className="flex min-w-0 items-center gap-3">
				<div className="pointer-events-none flex h-11 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted shadow-sm">
					{coverFilename ? (
						<img
							src={getCoverUrl(coverFilename, 120)}
							alt=""
							loading="lazy"
							decoding="async"
							className="h-full w-full object-cover"
						/>
					) : (
						coverFallback
					)}
				</div>
				<div className="min-w-0">
					<p className="pointer-events-none line-clamp-1 font-medium text-sm">
						{title}
					</p>
					{resolvedSubtitle ? (
						<div className="relative z-10 line-clamp-1 text-muted-foreground text-xs lg:hidden">
							{resolvedSubtitle}
						</div>
					) : null}
				</div>
			</div>

			{withAuthor ? (
				<div
					className={cn(COL_AUTHOR, "relative z-10 min-w-0 truncate text-sm")}
				>
					{hasAuthors ? (
						<AuthorLinkList
							authors={authors}
							className="text-muted-foreground"
							linkClassName="transition-colors hover:text-foreground"
						/>
					) : (
						<span className="text-muted-foreground/50">—</span>
					)}
				</div>
			) : null}

			{withMeta ? (
				<span
					className={cn(
						COL_META,
						"pointer-events-none truncate text-right text-muted-foreground text-xs tabular-nums",
					)}
				>
					{meta ?? "—"}
				</span>
			) : null}
		</div>
	);
}
