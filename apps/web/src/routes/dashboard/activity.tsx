import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { useState } from "react";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { ActivitySidebar } from "@/components/shared/activity-sidebar";
import { EmptyState } from "@/components/shared/empty-state";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/activity")({
	component: FeedPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
	loader: ({ context }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchInfiniteQuery(
			orpc.profile.getSocialFeed.infiniteOptions({
				input: (pageParam?: number) => ({
					type: "following",
					limit: 15,
					cursor: pageParam,
				}),
				getNextPageParam: (lastPage) =>
					lastPage.length === 15 ? lastPage[lastPage.length - 1].id : undefined,
				initialPageParam: undefined,
			}),
		);
	},
});

type FeedType = "global" | "following";

function FeedPage() {
	const [activeTab, setActiveTab] = useState<FeedType>("following");
	const { data: session } = authClient.useSession();

	return (
		<div className="mx-auto max-w-6xl p-6 lg:p-8">
			<div className="flex gap-8">
				{/* Main column */}
				<div className="min-w-0 flex-1 space-y-6">
					<div>
						<h1 className="font-bold text-2xl tracking-tight">Activity</h1>
					</div>

					{/* Tabs */}
					<div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
						<button
							type="button"
							onClick={() => setActiveTab("global")}
							className={`flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
								activeTab === "global"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Global
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("following")}
							className={`flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
								activeTab === "following"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Following
						</button>
					</div>

					<FeedList type={activeTab} currentUserId={session?.user?.id} />
				</div>

				{/* Right rail */}
				<ActivitySidebar />
			</div>
		</div>
	);
}

function FeedList({
	type,
	currentUserId,
}: {
	type: FeedType;
	currentUserId?: string;
}) {
	const queryClient = useQueryClient();

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
		useInfiniteQuery(
			orpc.profile.getSocialFeed.infiniteOptions({
				input: (pageParam?: number) => ({ type, limit: 15, cursor: pageParam }),
				getNextPageParam: (lastPage) =>
					lastPage.length === 15 ? lastPage[lastPage.length - 1].id : undefined,
				initialPageParam: undefined,
			}),
		);

	const feed = data?.pages.flat() || [];

	const { loadMoreRef: observerTarget } = useInfiniteScroll({
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	});

	return (
		<ActivityFeed
			items={feed}
			isLoading={isLoading}
			currentUserId={currentUserId}
			resolveUser={(item) => ({
				id: item.userId,
				name: item.userName,
				image: item.userImage,
				username: item.userUsername,
				displayUsername: item.userDisplayUsername,
			})}
			onInvalidate={() => {
				queryClient.invalidateQueries({
					queryKey: orpc.profile.getSocialFeed.key(),
				});
			}}
			emptyState={
				<EmptyState
					icon={<Activity className="size-5" />}
					title="No activity yet"
					description={
						type === "following"
							? "Start reading or follow some users to see activity here!"
							: "Start reading to see activity here!"
					}
				/>
			}
			className="space-y-2.5"
			footer={
				<div ref={observerTarget} className="py-4 text-center">
					{isFetchingNextPage && (
						<div className="text-muted-foreground text-sm">Loading more...</div>
					)}
					{!hasNextPage && feed.length > 0 && (
						<div className="text-muted-foreground text-sm">
							You've reached the end
						</div>
					)}
				</div>
			}
		/>
	);
}
