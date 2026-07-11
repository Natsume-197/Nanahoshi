import {
	BookOpenText,
	CalendarBlank,
	Clock,
	TextT,
	UserMinus,
	UserPlus,
	Users,
} from "@phosphor-icons/react";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import {
	BookShelfSections,
	type ShelfBook,
	type ShelfStatus,
	useProfileShelves,
} from "@/components/profile/book-shelf-sections";
import { ProfileBooksGrid } from "@/components/profile/profile-books-grid";
import {
	ProfileTaste,
	type TasteAuthor,
} from "@/components/profile/profile-taste";
import { ReadingHeatmap } from "@/components/profile/reading-heatmap";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, formatReadingDuration } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

const SHELF_STATUS_VALUES: ShelfStatus[] = [
	"want_to_read",
	"backlog",
	"reading",
	"completed",
];

export const Route = createFileRoute("/dashboard/user/$username/")({
	component: UserProfilePage,
	validateSearch: (
		search: Record<string, unknown>,
	): { tab?: "books"; shelf?: ShelfStatus } => ({
		tab: search.tab === "books" ? "books" : undefined,
		shelf: SHELF_STATUS_VALUES.includes(search.shelf as ShelfStatus)
			? (search.shelf as ShelfStatus)
			: undefined,
	}),
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
	pendingComponent: ProfileSkeleton,
});

/** Counts author appearances across the user's shelves for the taste chips. */
function aggregateTopAuthors(books: ShelfBook[]): TasteAuthor[] {
	const map = new Map<string, TasteAuthor>();
	for (const book of books) {
		for (const author of book.authors ?? []) {
			if (!author?.name) continue;
			const existing = map.get(author.name);
			if (existing) existing.count += 1;
			else
				map.set(author.name, {
					uuid: author.uuid ?? null,
					name: author.name,
					count: 1,
				});
		}
	}
	// With few distinct authors, keep singletons; otherwise require 2+ appearances.
	const keepSingletons = map.size <= 4;
	return [...map.values()]
		.sort((a, b) => b.count - a.count)
		.filter((a) => keepSingletons || a.count > 1)
		.slice(0, 4);
}

function UserProfilePage() {
	const { username } = useParams({ from: "/dashboard/user/$username/" });
	const { tab, shelf } = Route.useSearch();
	const navigate = Route.useNavigate();
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

	const statsQuery = useQuery(
		isOwnProfile
			? orpc.profile.getStats.queryOptions()
			: orpc.profile.getPublicStats.queryOptions({ input: { username } }),
	);

	const activityQuery = useQuery(
		isOwnProfile
			? orpc.profile.getActivityFeed.queryOptions({ input: { limit: 25 } })
			: orpc.profile.getPublicActivityFeed.queryOptions({
					input: { username, limit: 25 },
				}),
	);

	const calendarQuery = useQuery(
		isOwnProfile
			? orpc.profile.getActivityCalendar.queryOptions()
			: orpc.profile.getPublicActivityCalendar.queryOptions({
					input: { username },
				}),
	);

	const shelves = useProfileShelves(username);

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
	const stats = statsQuery.data;
	const activities = activityQuery.data;
	const isFollowingUser = followQuery.data;
	const counts = countsQuery.data;

	const displayUsername =
		(profile && "displayUsername" in profile
			? profile.displayUsername
			: undefined) ?? username;

	const topAuthors = aggregateTopAuthors(shelves.allBooks);

	const headerUrl =
		(profile && "headerImage" in profile ? profile.headerImage : undefined) ??
		null;

	const followButton = isOwnProfile ? null : isFollowingUser ? (
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
	);

	return (
		<div className="mx-auto w-full max-w-[1400px] px-4 pb-8 sm:px-6">
			{/* Banner */}
			<div className="relative mt-4 h-40 w-full overflow-hidden rounded-xl bg-muted sm:h-52 md:h-60">
				{headerUrl ? (
					<img
						src={headerUrl as string}
						alt=""
						className="h-full w-full object-cover opacity-0 transition-opacity duration-300 ease-out-quint"
						decoding="async"
						onLoad={(e) => e.currentTarget.classList.remove("opacity-0")}
						ref={(el) => {
							if (el?.complete) el.classList.remove("opacity-0");
						}}
					/>
				) : (
					<div className="h-full w-full bg-gradient-to-br from-primary/15 via-muted to-chart-5/15" />
				)}
			</div>

			{/* Identity header — the row is pulled up so the avatar overlaps the
			    banner; name/follow are bottom-aligned and stay below the banner.
			    `relative z-10` paints the row above the positioned (relative)
			    banner, which would otherwise cover the overlapping avatar. */}
			<div className="relative z-10 -mt-12 flex items-end justify-between gap-3 sm:-mt-16">
				<div className="flex min-w-0 flex-1 items-end gap-3 sm:gap-4">
					<UserAvatar
						name={profile?.name}
						image={profile?.image}
						className="size-20 shrink-0 rounded-full ring-4 ring-background sm:size-28 md:size-32"
						fallbackClassName="rounded-full bg-muted font-bold text-2xl text-foreground sm:text-3xl"
					/>
					<div className="min-w-0 pb-1">
						<h1 className="truncate font-bold text-xl leading-tight tracking-tight sm:text-2xl">
							{profile?.name ?? displayUsername}
						</h1>
						<p className="truncate text-base text-muted-foreground sm:text-lg">
							@{displayUsername}
						</p>
					</div>
				</div>
				{followButton && <div className="shrink-0 pb-1">{followButton}</div>}
			</div>

			<hr className="my-5 border-border/60" />

			{/* Body — sidebar + main */}
			<div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
				<aside className="space-y-4 lg:w-[296px] lg:shrink-0">
					{profile?.bio && (
						<p className="whitespace-pre-wrap text-sm leading-relaxed">
							{profile.bio}
						</p>
					)}

					{counts && (
						<div className="flex items-center gap-1.5 text-sm">
							<Users className="size-4 text-muted-foreground" />
							<span className="tabular-nums">
								<span className="font-semibold">{counts.followers}</span>{" "}
								<span className="text-muted-foreground">followers</span>
							</span>
							<span className="text-muted-foreground">·</span>
							<span className="tabular-nums">
								<span className="font-semibold">{counts.following}</span>{" "}
								<span className="text-muted-foreground">following</span>
							</span>
						</div>
					)}

					<div className="space-y-1.5 text-sm">
						<MetaRow
							icon={BookOpenText}
							value={stats ? String(stats.booksCompleted) : undefined}
							label="books finished"
						/>
						<MetaRow
							icon={Clock}
							value={
								stats
									? formatReadingDuration(stats.totalReadingTimeSeconds)
									: undefined
							}
							label="read"
						/>
						<MetaRow
							icon={TextT}
							value={stats ? formatNumber(stats.totalCharsRead) : undefined}
							label="characters"
						/>
						{profile?.createdAt && (
							<div className="flex items-center gap-2 text-muted-foreground">
								<CalendarBlank className="size-4 shrink-0" />
								<span>
									Member since{" "}
									{new Date(profile.createdAt).toLocaleDateString(undefined, {
										year: "numeric",
										month: "long",
									})}
								</span>
							</div>
						)}
					</div>

					<ProfileTaste authors={topAuthors} />
				</aside>

				{/* Main */}
				<main className="min-w-0 flex-1">
					<Tabs
						value={tab ?? "overview"}
						onValueChange={(value) =>
							navigate({
								search: value === "books" ? { tab: "books", shelf } : {},
								replace: true,
							})
						}
					>
						<TabsList variant="line">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="books">Books</TabsTrigger>
						</TabsList>

						<TabsContent value="overview" className="space-y-6 pt-6">
							<section>
								<h2 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									Shelves
								</h2>
								<BookShelfSections shelves={shelves} />
							</section>

							<ReadingHeatmap
								data={calendarQuery.data ?? []}
								isLoading={calendarQuery.isLoading}
							/>

							<section>
								<h2 className="mb-3 font-semibold text-sm">Activity</h2>
								<ActivityFeed
									items={activities}
									isLoading={activityQuery.isLoading}
									currentUserId={session?.user?.id}
									skeletonCount={3}
									resolveUser={() =>
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
									onInvalidate={() => {
										queryClient.invalidateQueries({
											queryKey: orpc.profile.getActivityFeed.key(),
										});
										queryClient.invalidateQueries({
											queryKey: orpc.profile.getPublicActivityFeed.key(),
										});
									}}
									emptyState={
										<p className="py-10 text-center text-muted-foreground text-sm">
											No activity yet
										</p>
									}
								/>
							</section>
						</TabsContent>

						<TabsContent value="books" className="pt-6">
							<ProfileBooksGrid
								username={username}
								status={shelf}
								onStatusChange={(status) =>
									navigate({
										search: { tab: "books", shelf: status },
										replace: true,
									})
								}
							/>
						</TabsContent>
					</Tabs>
				</main>
			</div>
		</div>
	);
}

function MetaRow({
	icon: Icon,
	value,
	label,
}: {
	icon: React.ComponentType<{ className?: string }>;
	value: string | undefined;
	label: string;
}) {
	return (
		<div className="flex items-center gap-2 text-muted-foreground">
			<Icon className="size-4 shrink-0" />
			{value === undefined ? (
				<Skeleton className="h-4 w-28" />
			) : (
				<span>
					<span className="font-semibold text-foreground tabular-nums">
						{value}
					</span>{" "}
					{label}
				</span>
			)}
		</div>
	);
}

function ProfileSkeleton() {
	return (
		<div className="mx-auto w-full max-w-[1400px] px-4 pb-8 sm:px-6">
			{/* Banner */}
			<Skeleton className="mt-4 h-40 w-full rounded-xl sm:h-52 md:h-60" />

			{/* Identity header */}
			<div className="relative z-10 -mt-12 flex items-end gap-3 sm:-mt-16 sm:gap-4">
				<Skeleton className="size-20 shrink-0 rounded-full ring-4 ring-background sm:size-28 md:size-32" />
				<div className="space-y-2 pb-1">
					<Skeleton className="h-7 w-40" />
					<Skeleton className="h-5 w-28" />
				</div>
			</div>

			<hr className="my-5 border-border/60" />

			<div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
				<aside className="space-y-3 lg:w-[296px] lg:shrink-0">
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-4 w-40" />
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-36" />
				</aside>
				<main className="min-w-0 flex-1">
					<div className="flex gap-4 border-border/40 border-b pb-2">
						<Skeleton className="h-5 w-20" />
						<Skeleton className="h-5 w-16" />
					</div>
					<div className="mt-6 space-y-6">
						<div className="grid gap-3 sm:grid-cols-2">
							<Skeleton className="h-28 w-full rounded-lg" />
							<Skeleton className="h-28 w-full rounded-lg" />
							<Skeleton className="h-28 w-full rounded-lg" />
							<Skeleton className="h-28 w-full rounded-lg" />
						</div>
						<Skeleton className="h-40 w-full rounded-lg" />
					</div>
				</main>
			</div>
		</div>
	);
}
