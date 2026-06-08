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
	className = "space-y-4",
}: ActivityFeedProps<T>) {
	if (isLoading) {
		return (
			<div className={className}>
				{SKELETON_KEYS.slice(0, skeletonCount).map((key) => (
					<Skeleton key={key} className="h-32 w-full rounded-xl" />
				))}
			</div>
		);
	}

	if (!items || items.length === 0) {
		return <>{emptyState}</>;
	}

	return (
		<div className={className}>
			{items.map((item) => (
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
