import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";

export function CoverPreviewDialog({
	open,
	onOpenChange,
	coverUrl,
	coverSrcSet,
	title,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	coverUrl: string;
	coverSrcSet?: string;
	title: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="max-w-[min(92vw,48rem)] gap-0 rounded-2xl border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-[min(92vw,48rem)]"
			>
				<DialogTitle className="sr-only">{title} cover</DialogTitle>
				<DialogDescription className="sr-only">
					Large cover preview.
				</DialogDescription>
				<div className="relative mx-auto">
					<img
						src={coverUrl}
						srcSet={coverSrcSet}
						sizes="(max-width: 768px) 92vw, 48rem"
						alt={title}
						className="max-h-[88vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
						decoding="async"
					/>
					<DialogClose asChild>
						<Button
							variant="secondary"
							size="icon-sm"
							className="absolute top-3 right-3 rounded-full border-0 bg-black/65 text-white hover:bg-black/80 hover:text-white"
						>
							<X className="size-4" />
							<span className="sr-only">Close cover preview</span>
						</Button>
					</DialogClose>
				</div>
			</DialogContent>
		</Dialog>
	);
}
