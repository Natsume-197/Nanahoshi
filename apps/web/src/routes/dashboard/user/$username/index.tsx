import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { BookShelfSections } from "@/components/profile/book-shelf-sections";
import { ActivityCard } from "@/components/shared/activity-card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/user/$username/")({
	component: UserProfilePage,
	loader: ({ params: { username }, context }) => {
		const session = context.session;
		const isOwnProfile =
			(session?.user as { username?: string } | undefined)?.username ===
			username;

		const profileQuery = isOwnProfile
			? orpc.profile.getProfile.queryOptions()
			: orpc.profile.getPublicProfile.queryOptions({ input: { username } });

		queryClient.prefetchQuery(profileQuery);
	},
});

function UserProfilePage() {
	const { username } = useParams({ from: "/dashboard/user/$username/" });
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();

	const sessionUsername = (session?.user as { username?: string } | undefined)
		?.username;
	const isOwnProfile = !!sessionUsername && sessionUsername === username;

	const profileQuery = useSuspenseQuery(
		isOwnProfile
			? orpc.profile.getProfile.queryOptions()
			: orpc.profile.getPublicProfile.queryOptions({
					input: { username },
				}),
	);

	const activityQuery = useQuery(
		isOwnProfile
			? orpc.profile.getActivityFeed.queryOptions({ input: { limit: 25 } })
			: orpc.profile.getPublicActivityFeed.queryOptions({
					input: { username, limit: 25 },
				}),
	);

	const followQuery = useQuery({
		...orpc.follow.isFollowing.queryOptions({ input: { username } }),
		enabled: !isOwnProfile && !!session,
	});

	const countsQuery = useQuery(
		orpc.follow.getCounts.queryOptions({ input: { username } }),
	);

	const followMutation = useMutation({
		mutationFn: () => client.follow.follow({ username }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.follow.isFollowing.queryOptions({ input: { username } })
					.queryKey,
			});
			queryClient.invalidateQueries({
				queryKey: orpc.follow.getCounts.queryOptions({ input: { username } })
					.queryKey,
			});
			toast.success("Followed!");
		},
	});

	const unfollowMutation = useMutation({
		mutationFn: () => client.follow.unfollow({ username }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.follow.isFollowing.queryOptions({ input: { username } })
					.queryKey,
			});
			queryClient.invalidateQueries({
				queryKey: orpc.follow.getCounts.queryOptions({ input: { username } })
					.queryKey,
			});
			toast.success("Unfollowed");
		},
	});

	const profile = profileQuery.data;
	const activities = activityQuery.data;
	const isFollowingUser = followQuery.data;
	const counts = countsQuery.data;

	const displayUsername =
		(profile && "displayUsername" in profile
			? profile.displayUsername
			: undefined) ?? username;

	const headerUrl =
		(profile && "headerImage" in profile ? profile.headerImage : undefined) ??
		null;

	return (
		<div className="flex flex-col pb-16">
			{/* Banner */}
			<div className="relative h-44 w-full sm:h-56 md:h-64">
				<div className="absolute inset-0">
					{headerUrl ? (
						<img
							src={headerUrl as string}
							alt=""
							className="h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-out"
							decoding="async"
							onLoad={(e) => {
								e.currentTarget.classList.remove("opacity-0");
							}}
							ref={(el) => {
								if (el?.complete) el.classList.remove("opacity-0");
							}}
						/>
					) : (
						<div className="h-full w-full bg-muted" />
					)}
				</div>
				<div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
			</div>

			{/* Profile header */}
			<div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6">
				<div className="-mt-12 flex items-end gap-4 sm:-mt-16 sm:gap-5">
					<div className="shrink-0 rounded-xl ring-4 ring-background">
						<UserAvatar
							name={profile?.name}
							image={profile?.image}
							className="size-20 rounded-lg bg-muted sm:size-28"
							fallbackClassName="rounded-lg bg-muted font-bold text-2xl text-foreground sm:text-3xl"
						/>
					</div>

					<div className="flex min-w-0 flex-1 items-end justify-between gap-3 pb-1">
						<div className="min-w-0">
							<h1 className="truncate font-bold text-xl tracking-tight sm:text-2xl">
								{profile?.name ?? <Skeleton className="h-7 w-40" />}
							</h1>
							<p className="truncate text-muted-foreground text-sm">
								@{displayUsername}
							</p>
						</div>

						{!isOwnProfile && session && (
							<div className="shrink-0">
								{isFollowingUser ? (
									<Button
										variant="outline"
										size="sm"
										onClick={() => unfollowMutation.mutate()}
										disabled={unfollowMutation.isPending}
										className="gap-1.5"
									>
										<UserMinus className="size-4" />
										Unfollow
									</Button>
								) : (
									<Button
										size="sm"
										onClick={() => followMutation.mutate()}
										disabled={followMutation.isPending}
										className="gap-1.5"
									>
										<UserPlus className="size-4" />
										Follow
									</Button>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Counts + bio */}
				<div className="mt-4 space-y-2">
					{counts && (
						<div className="flex items-center gap-4 text-sm tabular-nums">
							<span>
								<span className="font-semibold">{counts.followers}</span>{" "}
								<span className="text-muted-foreground">followers</span>
							</span>
							<span>
								<span className="font-semibold">{counts.following}</span>{" "}
								<span className="text-muted-foreground">following</span>
							</span>
						</div>
					)}
					{profile?.bio && (
						<p className="max-w-lg whitespace-pre-wrap text-sm leading-relaxed">
							{profile.bio}
						</p>
					)}
				</div>
			</div>

			{/* Content */}
			<div className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6">
				<div className="flex flex-col gap-8 lg:flex-row">
					{/* Shelves */}
					<div className="min-w-0 flex-1">
						<BookShelfSections
							username={username}
							isOwnProfile={isOwnProfile}
						/>
					</div>

					{/* Activity */}
					<div className="w-full lg:w-96 xl:w-[26rem]">
						<h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
							Activity
						</h2>

						{activityQuery.isLoading ? (
							<div className="space-y-3">
								{Array.from({ length: 4 }, (_, i) => (
									<Skeleton key={i} className="h-32 w-full rounded-lg" />
								))}
							</div>
						) : activities && activities.length > 0 ? (
							<div className="space-y-2.5">
								{activities.map((item) => (
									<ActivityCard
										key={item.id}
										activity={item}
										user={
											profile
												? {
														id: profile.id,
														name: profile.name,
														image: profile.image,
														username: profile.username,
														displayUsername: profile.displayUsername,
													}
												: undefined
										}
										currentUserId={session?.user?.id}
										onInvalidate={() => {
											queryClient.invalidateQueries({
												queryKey: orpc.profile.getActivityFeed.queryKey(),
											});
											queryClient.invalidateQueries({
												queryKey: orpc.profile.getPublicActivityFeed.queryKey(),
											});
										}}
									/>
								))}
							</div>
						) : (
							<Card>
								<CardContent className="py-10 text-center text-muted-foreground text-sm">
									No activity yet
								</CardContent>
							</Card>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
