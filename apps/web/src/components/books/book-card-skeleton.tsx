import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface BookCardSkeletonProps {
	className?: string;
	/** Match audiobook square covers; otherwise the 2/3 book ratio. */
	square?: boolean;
}

export function BookCardSkeleton({
	className,
	square = false,
}: BookCardSkeletonProps): JSX.Element {
	return (
		<div className={cn("flex flex-col gap-3 rounded-md p-2", className)}>
			<Skeleton
				className={cn(
					"w-full rounded-md",
					square ? "aspect-square" : "aspect-[2/3]",
				)}
			/>
			<div className="min-h-[4.9375rem] space-y-1 px-0.5">
				<Skeleton className="h-4 w-4/5 rounded" />
				<Skeleton className="h-3 w-3/5 rounded" />
			</div>
		</div>
	);
}
