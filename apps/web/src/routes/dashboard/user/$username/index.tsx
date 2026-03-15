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
import { ProfileBooksGrid } from "@/components/profile/profile-books-grid";
import { ActivityCard } from "@/components/shared/activity-card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
	const { session } = Route.useRouteContext();
	const sessionUsername = (session.user as { username?: string }).username;
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
			</div>

			{/* Profile header */}
			<div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 sm:px-6">
				<div className="-mt-12 flex items-end gap-4 sm:-mt-12 sm:gap-5">
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

						{!isOwnProfile && (
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

			</div>

			{/* Tabs */}
			<div className="mx-auto mt-6 w-full max-w-[1800px] px-4 sm:px-6">
				<Tabs defaultValue="overview">
					<TabsList variant="line">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="books">Book List</TabsTrigger>
					</TabsList>

					{/* Overview: shelves left, activity right */}
					<TabsContent value="overview" className="pt-6">
						<div className="flex flex-col gap-8 xl:flex-row">
							{/* Left — shelves */}
							<div className="min-w-0 xl:flex-1">
								<BookShelfSections
									username={username}
									isOwnProfile={isOwnProfile}
								/>
							</div>

							{/* Right — activity */}
							<div className="w-full xl:w-[50%]">
								{activityQuery.isLoading ? (
									<div className="grid gap-2.5 md:grid-cols-2">
										{["s1", "s2", "s3", "s4"].map((id) => (
											<Skeleton key={id} className="h-32 w-full rounded-md" />
										))}
									</div>
								) : activities && activities.length > 0 ? (
									<div className="grid gap-2.5 md:grid-cols-2">
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
									<p className="py-10 text-center text-muted-foreground text-sm">
										No activity yet
									</p>
								)}
							</div>
						</div>
					</TabsContent>

					{/* Book List: full grid with filters + pagination */}
					<TabsContent value="books" className="pt-6">
						<ProfileBooksGrid username={username} />
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
