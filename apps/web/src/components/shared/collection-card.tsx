import { FolderSimple } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { CollectionContextMenu } from "./collection-context-menu";

// Square mosaic of up to four unique covers, falling back to a folder glyph when
// the collection has none. Shared by every collection card surface.
function CollectionArtwork({ covers }: { covers: string[] }): JSX.Element {
	const filenames = Array.from(
		new Set(
			covers
				.map(getCoverFilename)
				.filter((filename): filename is string => filename !== null),
		),
	).slice(0, 4);

	if (filenames.length === 0) {
		return (
			<div className="flex size-full items-center justify-center bg-muted">
				<FolderSimple
					className="size-12 text-muted-foreground/35"
					weight="light"
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"grid size-full gap-px bg-border",
				filenames.length === 1 ? "grid-cols-1" : "grid-cols-2",
				filenames.length > 2 && "grid-rows-2",
			)}
		>
			{filenames.map((filename, index) => (
				<img
					key={filename}
					src={getCoverPresetUrl(filename, coverPresets.small)}
					srcSet={getCoverSrcSet(filename, coverPresets.small.widths)}
					sizes={coverPresets.small.sizes}
					alt=""
					loading="lazy"
					className={cn(
						"size-full min-h-0 object-cover",
						filenames.length === 3 && index === 0 && "row-span-2",
					)}
				/>
			))}
		</div>
	);
}

// Unified collection tile: square cover mosaic + name + subtitle, wrapped in the
// rename/delete context menu. Width is owned by the caller (`className`) so the
// same card fills a carousel slot on the dashboard and a grid cell on the
// library/search pages.
export function CollectionCard({
	id,
	name,
	previewCovers,
	subtitle,
	className,
}: {
	id: string;
	name: string;
	previewCovers: string[];
	subtitle: string;
	className?: string;
}): JSX.Element {
	return (
		<CollectionContextMenu collectionId={id} collectionName={name}>
			<Link
				to="/dashboard/collections/$collectionId"
				params={{ collectionId: id }}
				preload="intent"
				className={cn(
					"flex flex-col gap-3 rounded-lg p-2 transition-colors duration-150 ease-out hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					className,
				)}
			>
				<div className="aspect-square w-full overflow-hidden rounded-md bg-muted shadow-md ring-1 ring-border/50">
					<CollectionArtwork covers={previewCovers} />
				</div>
				<div className="flex min-w-0 flex-col gap-1">
					<p className="truncate font-semibold text-sm">{name}</p>
					<p className="truncate text-muted-foreground text-xs tabular-nums">
						{subtitle}
					</p>
				</div>
			</Link>
		</CollectionContextMenu>
	);
}

export function CollectionCardSkeleton({
	className,
}: {
	className?: string;
}): JSX.Element {
	return (
		<div className={cn("flex flex-col gap-3 p-2", className)}>
			<Skeleton className="aspect-square w-full rounded-md" />
			<div className="flex flex-col gap-2">
				<Skeleton className="h-4 w-3/4 rounded" />
				<Skeleton className="h-3 w-20 rounded" />
			</div>
		</div>
	);
}
