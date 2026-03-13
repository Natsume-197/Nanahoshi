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
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/user/$username/")({
	component: UserProfilePage,
	loader: async ({ params: { username }, context }) => {
		const session = context.session;
		const isOwnProfile = session?.user?.username === username;

		const profileQuery = isOwnProfile
			? orpc.profile.getProfile.queryOptions()
			: orpc.profile.getPublicProfile.queryOptions({ input: { username } });

		await queryClient.prefetchQuery(profileQuery);

		// Note: We don't block the page navigation on activities so they can load gracefully
	},
});

const ACTIVITY_SKELETON_IDS = [
	"activity-skeleton-1",
	"activity-skeleton-2",
	"activity-skeleton-3",
	"activity-skeleton-4",
] as const;

function UserProfilePage() {
	const { username } = useParams({ from: "/dashboard/user/$username/" });
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();

	const isOwnProfile = session?.user?.username === username;

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
		<div className="flex min-h-screen flex-col pb-16">
			{/* Banner Section */}
			<div className="relative h-40 w-full md:h-56 lg:h-72">
				{/* Banner Image */}
				<div className="absolute inset-0">
					{headerUrl ? (
						<img
							src={headerUrl as string}
							alt="Banner"
							className="h-full w-full object-cover"
						/>
					) : (
						<div className="h-full w-full bg-gradient-to-br from-chart-1/30 via-primary/20 to-chart-5/30" />
					)}
				</div>

				{/* Gradient Overlay for Text/Avatar contrast */}
				<div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />

				{/* Avatar inside banner (bottom-left) */}
				<div className="absolute bottom-0 left-0 w-full">
					<div className="mx-auto flex w-[95%] items-end justify-between gap-4 px-4 pb-4 sm:px-6 xl:px-8">
						<div className="flex min-w-0 flex-1 items-end gap-6">
							{/* Avatar */}
							<div className="relative z-10 shrink-0">
								<div className="rounded-xl shadow-2xl shadow-black/40 ring-2 ring-border/50">
									<UserAvatar
										name={profile?.name}
										image={profile?.image}
										className="size-24 rounded-lg bg-muted object-cover sm:size-32 md:size-40"
										fallbackClassName="rounded-lg bg-muted font-extrabold text-3xl text-foreground sm:text-4xl"
									/>
								</div>
							</div>

							{/* Info next to avatar (inside banner) */}
							<div className="flex flex-1 flex-col justify-end gap-0.5 pb-1 md:pb-2">
								<h1 className="font-bold text-2xl text-white tracking-tight drop-shadow-md sm:text-3xl">
									{profile?.name ?? (
										<Skeleton className="h-8 w-40 bg-white/20" />
									)}
								</h1>
								<p className="font-medium text-white/80 drop-shadow">
									@{displayUsername}
								</p>

								{/* Follower/following counts */}
								{counts && (
									<div className="mt-2 flex items-center gap-4 text-sm drop-shadow-md">
										<div className="flex items-center gap-1.5">
											<span className="font-bold text-white">
												{counts.followers}
											</span>
											<span className="text-white/80">Followers</span>
										</div>
										<div className="flex items-center gap-1.5">
											<span className="font-bold text-white">
												{counts.following}
											</span>
											<span className="text-white/80">Following</span>
										</div>
									</div>
								)}
							</div>
						</div>

						{/* Follow button in header */}
						{!isOwnProfile && session && (
							<div className="mb-2 shrink-0 md:mb-3">
								{isFollowingUser ? (
									<Button
										variant="outline"
										size="sm"
										onClick={() => unfollowMutation.mutate()}
										disabled={unfollowMutation.isPending}
										className="gap-1.5 rounded-full border-white/20 bg-background/30 px-5 text-white shadow-sm backdrop-blur-md hover:bg-background/50 hover:text-white"
									>
										<UserMinus className="size-4" />
										Unfollow
									</Button>
								) : (
									<Button
										size="sm"
										onClick={() => followMutation.mutate()}
										disabled={followMutation.isPending}
										className="gap-1.5 rounded-full bg-white px-5 text-black shadow-sm hover:bg-white/90"
									>
										<UserPlus className="size-4" />
										Follow
									</Button>
								)}
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="mx-auto w-[95%] px-4 sm:px-6 xl:px-8">
				{/* Main Content Layout */}
				<div className="mt-6 flex flex-col gap-6 lg:flex-row">
					{/* Left Column (Bio, Counts, Details) - Auto-width on LG */}
					<div className="w-full space-y-4 lg:max-w-[600px]">
						<BookShelfSections
							username={username}
							isOwnProfile={isOwnProfile}
						/>
					</div>

					{/* Right Column (Activity Feed) */}
					<div>
						{/* Activity feed */}
						<div>
							<div className="mb-3 flex items-center justify-between">
								<h2 className="font-semibold text-foreground/90 text-lg">
									Activity
								</h2>
							</div>

							{activityQuery.isLoading ? (
								<div className="space-y-3">
									{ACTIVITY_SKELETON_IDS.map((skeletonId) => (
										<Skeleton
											key={skeletonId}
											className="h-20 w-full rounded-xl bg-card/60"
										/>
									))}
								</div>
							) : activities && activities.length > 0 ? (
								<div className="grid grid-cols-1 gap-2.5 lg:grid-cols-1 xl:grid-cols-1">
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
													queryKey:
														orpc.profile.getPublicActivityFeed.queryKey(),
												});
											}}
										/>
									))}
								</div>
							) : (
								<Card className="border-border/40 border-dashed bg-card/20">
									<CardContent className="py-12 text-center text-muted-foreground text-sm">
										No activity yet.
									</CardContent>
								</Card>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
