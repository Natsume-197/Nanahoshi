import type { Icon } from "@phosphor-icons/react";
import { BookOpen, Check, Clock, Heart } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { JSX } from "react";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { CollectionArtwork } from "./collection-card";

export type ShelfBucket = "want" | "reading" | "backlog" | "completed";

const BUCKET_META: Record<ShelfBucket, { icon: Icon; label: () => string }> = {
	want: { icon: Heart, label: () => m["book.shelf_want_to_read"]() },
	reading: { icon: BookOpen, label: () => m["book.shelf_reading"]() },
	backlog: { icon: Clock, label: () => m["book.shelf_backlog"]() },
	completed: { icon: Check, label: () => m["book.shelf_completed"]() },
};

export function shelfBucketLabel(status: ShelfBucket): string {
	return BUCKET_META[status].label();
}

// A pinned "system list" tile: same square mosaic + name + subtitle as a
// collection card, but it links to the unified reading-status shelf and falls
// back to a status glyph (not a folder) when the bucket has no covers yet.
export function ShelfCard({
	status,
	previewCovers,
	subtitle,
	className,
}: {
	status: ShelfBucket;
	previewCovers: string[];
	subtitle: string;
	className?: string;
}): JSX.Element {
	const StatusIcon = BUCKET_META[status].icon;

	return (
		<Link
			to="/dashboard/shelves/$status"
			params={{ status }}
			preload="intent"
			className={cn(
				"flex flex-col gap-3 rounded-lg p-2 transition-colors duration-150 ease-out hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				className,
			)}
		>
			<div className="aspect-square w-full overflow-hidden rounded-md bg-muted shadow-md ring-1 ring-border/50">
				<CollectionArtwork
					covers={previewCovers}
					fallback={
						<StatusIcon
							className="size-12 text-muted-foreground/35"
							weight="light"
						/>
					}
				/>
			</div>
			<div className="flex min-w-0 flex-col gap-1">
				<p className="truncate font-semibold text-sm">
					{BUCKET_META[status].label()}
				</p>
				<p className="truncate text-muted-foreground text-xs tabular-nums">
					{subtitle}
				</p>
			</div>
		</Link>
	);
}
