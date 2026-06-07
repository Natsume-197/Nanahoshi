import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
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
	progress?: number | null;
	/** Accessible label for the progress bar (e.g. "Reading"/"Listening"). */
	progressLabel?: string;
	title: ReactNode;
	subtitle?: ReactNode;
}

function DefaultNoCover() {
	return (
		<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
			No cover
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
	progress,
	progressLabel = "Reading progress",
	title,
	subtitle,
}: BookCardShellProps) {
	return (
		<div className="group relative flex flex-col gap-3 rounded-md p-2 transition-colors duration-200 [contain-intrinsic-size:auto_320px] [content-visibility:auto] hover:bg-muted has-[:focus-visible]:bg-muted">
			<Link
				{...(linkProps as ComponentProps<typeof Link>)}
				aria-label={ariaLabel}
				className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				onMouseEnter={onLinkMouseEnter}
			/>
			<div
				className={cn(
					"pointer-events-none relative w-full bg-muted transition-transform duration-500 max-md:group-active:scale-95 max-md:group-active:duration-150",
					square ? "aspect-square rounded-md" : "aspect-[2/3]",
				)}
			>
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
			{/* The text block reserves a fixed height (2-line title + gap + 1-line
			    subtitle) so every tile is the same height and the hover background
			    never changes size. Content is top-aligned, so the subtitle always
			    sits directly under the title and any slack falls at the bottom. */}
			<div className="min-h-[4.3125rem] min-w-0 space-y-1 px-0.5">
				<div className="pointer-events-none">
					<p className="line-clamp-2 font-medium text-sm leading-relaxed [&>em]:font-bold [&>em]:text-primary [&>em]:not-italic">
						{title}
					</p>
				</div>
				{subtitle && (
					<p className="relative z-10 line-clamp-1 text-muted-foreground text-xs leading-relaxed [&>span]:inline">
						{subtitle}
					</p>
				)}
			</div>
		</div>
	);
}
