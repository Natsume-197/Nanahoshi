import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface BookCardSkeletonProps {
	className?: string;
	/** Match a uniform square-artwork carousel while it loads. */
	square?: boolean;
	/** Match the shorter text reservation used by dashboard carousel tiles. */
	compactTextBlock?: boolean;
}

export function BookCardSkeleton({
	className,
	square = false,
	compactTextBlock = false,
}: BookCardSkeletonProps): JSX.Element {
	return (
		<div className={cn("flex flex-col gap-3 rounded-md p-1", className)}>
			<Skeleton
				className={cn(
					"w-full rounded-md",
					square ? "aspect-square" : "aspect-[2/3]",
				)}
			/>
			<div
				className={cn(
					"flex flex-col gap-1 px-0.5",
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
