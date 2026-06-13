import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
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
	trailing,
}: {
	linkProps: RowLinkProps;
	coverFilename?: string | null;
	/** Rendered inside the thumbnail frame when there is no cover. */
	fallback?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	trailing?: ReactNode;
}) {
	return (
		<Link
			{...(linkProps as ComponentProps<typeof Link>)}
			className="flex items-center gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
		>
			<div className="flex h-16 w-[2.7rem] shrink-0 items-center justify-center overflow-hidden rounded bg-muted shadow-sm">
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
				<p className="line-clamp-1 font-medium">{title}</p>
				{subtitle ? (
					<p className="line-clamp-1 text-muted-foreground text-sm">
						{subtitle}
					</p>
				) : null}
			</div>
			{trailing ? (
				<span className="shrink-0 text-muted-foreground text-xs">
					{trailing}
				</span>
			) : null}
		</Link>
	);
}
