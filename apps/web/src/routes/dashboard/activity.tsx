import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ActivityCard } from "@/components/shared/activity-card";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
					type: "global",
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
	const [activeTab, setActiveTab] = useState<FeedType>("global");
	const { data: session } = authClient.useSession();

	return (
		<div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
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

	if (isLoading) {
		return (
			<div className="space-y-4">
				{[1, 2, 3, 4].map((i) => (
					<Skeleton key={i} className="h-32 w-full rounded-xl" />
				))}
			</div>
		);
	}

	if (!feed || feed.length === 0) {
		return (
			<Card>
				<CardContent className="py-12 text-center text-muted-foreground text-sm">
					{type === "following"
						? "No activity from people you follow yet. Try following some users!"
						: "No activity yet. Start reading to see activity here!"}
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-2.5">
			{feed.map((item) => (
				<ActivityCard
					key={item.id}
					activity={item}
					user={{
						id: item.userId,
						name: item.userName,
						image: item.userImage,
						username: item.userUsername,
						displayUsername: item.userDisplayUsername,
					}}
					currentUserId={currentUserId}
					onInvalidate={() => {
						queryClient.invalidateQueries({
							queryKey: orpc.profile.getSocialFeed.key(),
						});
					}}
				/>
			))}

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
		</div>
	);
}
