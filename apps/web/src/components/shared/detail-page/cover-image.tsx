import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { coverPresets } from "@/utils/covers";

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
			<div className="relative overflow-hidden rounded-md shadow-xl">
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
				className={`relative ${aspectClass} overflow-hidden rounded-md bg-muted shadow-xl`}
			>
				<Skeleton className="absolute inset-0 rounded-md" />
				<img
					src={coverUrl}
					srcSet={coverSrcSet}
					sizes={coverPresets.detail.sizes}
					alt={title}
					width={320}
					height={imgHeight}
					className={`relative h-full w-full ${aspectRatio === "square" ? "object-cover" : ""}opacity-0 transition-opacity duration-500 ease-out`}
					loading="eager"
					decoding="async"
					fetchPriority="high"
					onLoad={(e) => {
						e.currentTarget.classList.remove("opacity-0");
					}}
					ref={(el) => {
						if (el?.complete) el.classList.remove("opacity-0");
					}}
				/>
				<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
				{progressBar}
			</div>
		</button>
	);
}
