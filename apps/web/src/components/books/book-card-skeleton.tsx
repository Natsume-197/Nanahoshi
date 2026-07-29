import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface BookCardSkeletonProps {
	className?: string;
	/** Kept for call-site compatibility; all artwork uses the same 2/3 frame. */
	square?: boolean;
	/** Match the shorter text reservation used by dashboard carousel tiles. */
	compactTextBlock?: boolean;
}

export function BookCardSkeleton({
	className,
	compactTextBlock = false,
}: BookCardSkeletonProps): JSX.Element {
	return (
		<div className={cn("flex flex-col gap-3 rounded-md p-1", className)}>
			<Skeleton className="aspect-[2/3] w-full rounded-md" />
			<div
				className={cn(
					"space-y-1 px-0.5",
					compactTextBlock ? "min-h-16" : "min-h-[4.9375rem]",
				)}
			>
				<Skeleton
					className={cn("w-4/5 rounded", compactTextBlock ? "h-5" : "h-4")}
				/>
				<Skeleton className="h-3 w-3/5 rounded" />
			</div>
		</div>
	);
}
