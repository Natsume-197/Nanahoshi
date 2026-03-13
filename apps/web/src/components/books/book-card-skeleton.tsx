import type { JSX } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface BookCardSkeletonProps {
	className?: string;
}

export function BookCardSkeleton({
	className,
}: BookCardSkeletonProps): JSX.Element {
	return (
		<div className={`flex flex-col gap-2 p-2 ${className}`}>
			<Skeleton className="aspect-[2/3] w-full rounded-lg" />
			<div className="space-y-1.5">
				<Skeleton className="h-4 w-4/5 rounded" />
				<Skeleton className="h-3 w-3/5 rounded" />
			</div>
		</div>
	);
}
