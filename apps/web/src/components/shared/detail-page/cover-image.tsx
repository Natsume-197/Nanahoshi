import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COVER_EDGE, coverPresets } from "@/utils/covers";

export function CoverImage({
	coverUrl,
	coverSrcSet,
	title,
	aspectRatio,
	fallback,
	onCoverClick,
	progressBar,
}: {
	coverUrl: string | null;
	coverSrcSet?: string;
	title: string;
	aspectRatio: "2/3" | "square";
	fallback: ReactNode;
	onCoverClick: () => void;
	progressBar?: ReactNode;
}) {
	const aspectClass = aspectRatio === "2/3" ? "aspect-[2/3]" : "aspect-square";
	const imgHeight = aspectRatio === "2/3" ? 480 : 320;

	if (!coverUrl) {
		return (
			<div
				className={cn(
					"relative overflow-hidden rounded-md shadow-xl",
					COVER_EDGE,
				)}
			>
				{fallback}
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={onCoverClick}
			aria-label={`View larger cover for ${title}`}
			className="group block w-full cursor-zoom-in rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
		>
			<div
				className={cn(
					"relative overflow-hidden rounded-md bg-muted shadow-xl",
					aspectClass,
					COVER_EDGE,
				)}
			>
				{/* No JS-driven fade-in here: the page is server-rendered, so the
				    artwork routinely finishes loading before React hydrates and any
				    load-gated opacity gets stuck at 0. The `bg-muted` box below is
				    the placeholder; the image simply paints over it. */}
				<img
					src={coverUrl}
					srcSet={coverSrcSet}
					sizes={coverPresets.detail.sizes}
					alt={title}
					width={320}
					height={imgHeight}
					className={cn(
						"relative h-full w-full",
						aspectRatio === "square" && "object-cover",
					)}
					loading="eager"
					decoding="async"
					fetchPriority="high"
				/>
				<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
				{progressBar}
			</div>
		</button>
	);
}
