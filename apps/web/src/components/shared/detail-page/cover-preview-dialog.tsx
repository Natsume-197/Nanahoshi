import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";

export function CoverPreviewDialog({
	open,
	onOpenChange,
	coverUrl,
	coverSrcSet,
	placeholderUrl,
	placeholderSrcSet,
	title,
	aspectRatio,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	coverUrl: string;
	coverSrcSet?: string;
	/** The detail-page cover, already decoded and in cache. */
	placeholderUrl?: string | null;
	placeholderSrcSet?: string;
	title: string;
	aspectRatio: "2/3" | "square";
}) {
	// Intrinsic size reserves the layout box before the bytes arrive. Without it
	// the container collapses and the close button floats alone mid-screen.
	const height = aspectRatio === "2/3" ? 1200 : 800;

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			bare
			showCloseButton={false}
			title={m["book.cover_preview_title"]({ title })}
			description={m["book.cover_preview_description"]()}
			className="max-w-[min(92vw,48rem)] gap-0 border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-[min(92vw,48rem)]"
		>
			<div className="relative mx-auto w-fit">
				{/* Opens filled instead of dark: this is the cover the page already
				    painted, so it costs nothing and the full-size file just sharpens
				    it in place. `sizes` matches the detail cover's so the browser
				    reuses that exact cached variant rather than fetching a new one. */}
				{placeholderUrl && (
					<img
						src={placeholderUrl}
						srcSet={placeholderSrcSet}
						sizes={coverPresets.detail.sizes}
						alt=""
						aria-hidden="true"
						className="absolute inset-0 h-full w-full rounded-xl object-contain"
					/>
				)}
				<img
					src={coverUrl}
					srcSet={coverSrcSet}
					sizes="(max-width: 768px) 92vw, 48rem"
					alt={title}
					width={800}
					height={height}
					className="relative max-h-[88vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
					decoding="async"
					fetchPriority="high"
				/>
				<Button
					variant="secondary"
					size="icon-sm"
					onClick={() => onOpenChange(false)}
					aria-label={m["book.close_cover_preview"]()}
					className="absolute end-3 top-3 rounded-full border-0 bg-black/65 text-white hover:bg-black/80 hover:text-white"
				>
					<X aria-hidden="true" className="size-4" />
				</Button>
			</div>
		</Modal>
	);
}
