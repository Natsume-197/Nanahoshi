import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getCoverUrl } from "@/utils/covers";

/**
 * Loose link shape — TanStack's `Link` props are strictly generic over the
 * route tree, so we keep this minimal and cast at the single spread site.
 */
interface RowLinkProps {
	to: string;
	params?: Record<string, string>;
	preload?: "intent" | "viewport" | "render" | false;
}

/**
 * One row of a collection list view (likes, series): cover thumbnail, title,
 * optional subtitle, and an optional trailing meta slot.
 */
export function MediaListRow({
	linkProps,
	coverFilename,
	fallback,
	title,
	subtitle,
	subtitleLines = 1,
	trailing,
}: {
	linkProps: RowLinkProps;
	coverFilename?: string | null;
	/** Rendered inside the thumbnail frame when there is no cover. */
	fallback?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	/** Number of subtitle rows (e.g. count + author). */
	subtitleLines?: 1 | 2;
	trailing?: ReactNode;
}) {
	// Overlay-link layout (mirrors BookCardShell): the full-row Link sits beneath
	// the content as an absolute z-0 sibling, so interactive bits inside the
	// subtitle (e.g. author links) can live above it at z-10 without nesting
	// anchors. The cover and title are pointer-events-none, so clicks there fall
	// through to the row link.
	return (
		<div className="group relative flex items-center gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-muted has-[:focus-visible]:bg-muted">
			<Link
				{...(linkProps as ComponentProps<typeof Link>)}
				className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
			/>
			<div className="pointer-events-none flex h-16 w-[2.7rem] shrink-0 items-center justify-center overflow-hidden rounded bg-muted shadow-sm">
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, 120)}
						alt=""
						loading="lazy"
						decoding="async"
						className="h-full w-full object-cover"
					/>
				) : (
					fallback
				)}
			</div>
			<div className="min-w-0 flex-1 space-y-0.5">
				<p className="pointer-events-none line-clamp-1 font-medium">{title}</p>
				{subtitle ? (
					<div
						className={cn(
							"relative z-10 text-muted-foreground text-sm",
							subtitleLines === 2
								? "pointer-events-none space-y-0.5"
								: "line-clamp-1 [&>span]:inline",
						)}
					>
						{subtitle}
					</div>
				) : null}
			</div>
			{trailing ? (
				<span className="pointer-events-none relative z-10 shrink-0 text-muted-foreground text-xs">
					{trailing}
				</span>
			) : null}
		</div>
	);
}
