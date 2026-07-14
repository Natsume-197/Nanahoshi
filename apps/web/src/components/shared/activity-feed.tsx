import type { ReactNode } from "react";
import {
	ActivityCard,
	type ActivityUser,
	type BaseActivity,
} from "@/components/shared/activity-card";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_KEYS = ["sk1", "sk2", "sk3", "sk4", "sk5", "sk6"];

interface ActivityFeedProps<T extends BaseActivity> {
	items: T[] | undefined;
	isLoading: boolean;
	/** Rendered when there are no items (and not loading). */
	emptyState: ReactNode;
	currentUserId?: string;
	/** Resolves the actor for an item (per-item for global feeds, constant for profiles). */
	resolveUser?: (item: T) => ActivityUser | undefined;
	onInvalidate?: () => void;
	skeletonCount?: number;
	/** Extra content appended after the list (e.g. an infinite-scroll sentinel). */
	footer?: ReactNode;
	className?: string;
}

/**
 * Shared loading / list / empty rendering for a list of {@link ActivityCard}s.
 * Used by the global activity feed and the profile pages so the skeleton, empty
 * state, and per-item wiring live in one place.
 */
export function ActivityFeed<T extends BaseActivity>({
	items,
	isLoading,
	emptyState,
	currentUserId,
	resolveUser,
	onInvalidate,
	skeletonCount = 4,
	footer,
	className = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] items-start gap-3",
}: ActivityFeedProps<T>) {
	if (isLoading) {
		return (
			<div className={className}>
				{SKELETON_KEYS.slice(0, skeletonCount).map((key) => (
					<ActivityCardSkeleton key={key} />
				))}
			</div>
		);
	}

	const visibleItems = items?.filter((item) => {
		const title = item.title?.trim().toLocaleLowerCase();
		return Boolean(title && title !== "untitled");
	});

	if (!visibleItems || visibleItems.length === 0) {
		return <>{emptyState}</>;
	}

	return (
		<div className={className}>
			{visibleItems.map((item) => (
				<ActivityCard
					key={item.id}
					activity={item}
					user={resolveUser?.(item)}
					currentUserId={currentUserId}
					onInvalidate={onInvalidate}
				/>
			))}
			{footer}
		</div>
	);
}

function ActivityCardSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="rounded-xl border border-border/60 bg-card/50 p-3"
		>
			<div className="flex min-h-24 gap-3">
				<Skeleton className="h-24 w-16 shrink-0 rounded-sm" />
				<div className="flex flex-1 flex-col gap-2 py-0.5">
					<div className="flex items-center justify-between gap-3">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-3 w-14" />
					</div>
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-3 w-1/2" />
					<div className="mt-auto flex justify-end gap-1">
						<Skeleton className="h-6 w-10 rounded-lg" />
						<Skeleton className="h-6 w-10 rounded-lg" />
					</div>
				</div>
			</div>
		</div>
	);
}
