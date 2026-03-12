import { useMutation, useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
	BookCheck,
	BookMarked,
	BookOpen,
	Check,
	Clock,
	Heart,
	MessageCircle,
	Pencil,
	Send,
	Trash2,
	Type,
	UserMinus,
	UserPlus,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { queryClient, client, orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

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

function formatRelativeTime(dateStr: string) {
	const now = Date.now();
	const date = new Date(dateStr).getTime();
	const diffMs = now - date;
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return new Date(dateStr).toLocaleDateString();
}

const activityConfig = {
	started_reading: {
		icon: BookOpen,
		label: "Started reading",
		color: "text-chart-1",
	},
	completed_reading: {
		icon: BookCheck,
		label: "Completed",
		color: "text-chart-4",
	},
	liked_book: {
		icon: Heart,
		label: "Liked",
		color: "text-destructive",
	},
} as const;

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
	const [editingBio, setEditingBio] = useState(false);
	const [bioValue, setBioValue] = useState("");

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

	const updateProfileMutation = useMutation({
		mutationFn: (bio: string) => client.profile.updateProfile({ bio }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getProfile.queryOptions().queryKey,
			});
			setEditingBio(false);
			toast.success("Profile updated");
		},
		onError: () => toast.error("Failed to update profile"),
	});

	const profile = profileQuery.data;
	const activities = activityQuery.data;
	const isFollowingUser = followQuery.data;
	const counts = countsQuery.data;

	const startEditBio = () => {
		setBioValue(profile?.bio ?? "");
		setEditingBio(true);
	};

	const saveBio = () => {
		updateProfileMutation.mutate(bioValue);
	};

	const displayUsername =
		(profile && "displayUsername" in profile
			? profile.displayUsername
			: undefined) ?? username;

	const headerUrl =
		(profile && "headerImage" in profile
			? profile.headerImage
			: undefined) ?? null;

	return (
		<div className="flex min-h-screen flex-col pb-16">
			{/* Banner Section */}
			<div className="relative h-48 w-full md:h-64 lg:h-80">
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
					<div className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6 xl:px-8 flex items-end justify-between gap-4">
						<div className="flex flex-1 items-end gap-6 min-w-0">
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
								<h1 className="font-bold text-2xl tracking-tight text-white drop-shadow-md sm:text-3xl">
									{profile?.name ?? <Skeleton className="h-8 w-40 bg-white/20" />}
								</h1>
								<p className="font-medium text-white/80 drop-shadow">
									@{displayUsername}
								</p>

								{/* Follower/following counts */}
								{counts && (
									<div className="mt-2 flex items-center gap-4 text-sm drop-shadow-md">
										<div className="flex items-center gap-1.5">
											<span className="font-bold text-white">{counts.followers}</span>
											<span className="text-white/80">Followers</span>
										</div>
										<div className="flex items-center gap-1.5">
											<span className="font-bold text-white">{counts.following}</span>
											<span className="text-white/80">Following</span>
										</div>
									</div>
								)}
							</div>
						</div>

						{/* Follow button in header */}
						{!isOwnProfile && session && (
							<div className="shrink-0 mb-2 md:mb-3">
								{isFollowingUser ? (
									<Button
										variant="outline"
										size="sm"
										onClick={() => unfollowMutation.mutate()}
										disabled={unfollowMutation.isPending}
										className="gap-1.5 rounded-full px-5 shadow-sm bg-background/30 text-white border-white/20 backdrop-blur-md hover:bg-background/50 hover:text-white"
									>
										<UserMinus className="size-4" />
										Unfollow
									</Button>
								) : (
									<Button
										size="sm"
										onClick={() => followMutation.mutate()}
										disabled={followMutation.isPending}
										className="gap-1.5 rounded-full px-5 shadow-sm bg-white text-black hover:bg-white/90"
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

			<div className="mx-auto w-full max-w-6xl px-4 sm:px-6 xl:px-8">
				{/* Navigation Bar */}
				<div className="mt-6 flex gap-6 overflow-x-auto border-border/40 border-b no-scrollbar sm:gap-8">
					<button
						type="button"
						className="whitespace-nowrap border-primary border-b-2 pb-3 font-medium text-primary text-sm"
					>
						Overview
					</button>
					<button
						type="button"
						className="whitespace-nowrap pb-3 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
					>
						Book List
					</button>
				</div>

				{/* Main Content Layout */}
				<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr]">
					{/* Left Column (Bio, Counts, Details) */}
					<div className="space-y-6">
						{/* Bio Card */}
						<Card className="border-border/40 bg-card/40 font-medium shadow-sm backdrop-blur-sm">
							<CardContent className="flex flex-col gap-4 p-5">
								<div>
									{editingBio ? (
										<div className="flex flex-col gap-2">
											<textarea
												value={bioValue}
												onChange={(e) => setBioValue(e.target.value)}
												maxLength={500}
												rows={4}
												className="w-full resize-none rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
												aria-label="Bio"
												placeholder="Write something about yourself..."
											/>
											<div className="flex items-center gap-2">
												<Button
													size="sm"
													onClick={saveBio}
													disabled={updateProfileMutation.isPending}
													className="rounded-lg shadow-sm"
												>
													<Check className="mr-1 size-3.5" />
													Save
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setEditingBio(false)}
													className="rounded-lg"
												>
													<X className="mr-1 size-3.5" />
													Cancel
												</Button>
												<span className="ml-auto text-muted-foreground text-xs">
													{bioValue.length}/500
												</span>
											</div>
										</div>
									) : (
										<div className="group relative">
											<p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/80">
												{profile?.bio || (
													<span className="text-muted-foreground italic">
														No bio yet
													</span>
												)}
											</p>
											{isOwnProfile && (
												<button
													type="button"
													onClick={startEditBio}
													aria-label="Edit bio"
													className="absolute -right-2 -top-2 rounded-lg bg-background/80 p-2 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border/50 backdrop-blur-md transition-all hover:text-foreground group-hover:opacity-100"
												>
													<Pencil className="size-3.5" />
												</button>
											)}
										</div>
									)}
								</div>

								{profile?.createdAt && (
									<p className="text-muted-foreground text-xs">
										Member since{" "}
										{new Date(profile.createdAt).toLocaleDateString(undefined, {
											year: "numeric",
											month: "long",
										})}
									</p>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Right Column (Activity Feed) */}
					<div className="space-y-8">
						{/* Activity feed */}
						<div>
							<div className="mb-4 flex items-center justify-between">
								<h2 className="font-semibold text-lg text-foreground/90">
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
								<div className="grid grid-cols-1 gap-4 lg:grid-cols-1 xl:grid-cols-2">
									{activities.map((item) => (
										<ActivityCard key={item.id} activity={item} currentUserId={session?.user?.id} />
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

function ActivityCard({
	activity,
	currentUserId,
}: {
	activity: {
		id: number;
		type: "started_reading" | "completed_reading" | "liked_book";
		createdAt: string;
		bookUuid: string;
		title: string | null;
		cover: string | null;
		likeCount: number;
		commentCount: number;
		isLiked: boolean;
	};
	currentUserId?: string;
}) {
	const queryClient = useQueryClient();
	const [showComments, setShowComments] = useState(false);
	const [commentText, setCommentText] = useState("");
	const [optimisticLiked, setOptimisticLiked] = useState(activity.isLiked);
	const [optimisticLikeCount, setOptimisticLikeCount] = useState(
		Number(activity.likeCount) || 0,
	);

	const config = activityConfig[activity.type];
	const Icon = config.icon;
	const coverFilename = activity.cover?.split("/").pop();
	const displayTitle = activity.title ?? "Untitled";

	const likeMutation = useMutation({
		mutationFn: (action: "like" | "unlike") =>
			action === "unlike"
				? client.profile.unlikeActivity({ activityId: activity.id })
				: client.profile.likeActivity({ activityId: activity.id }),
		onMutate: (action) => {
			const isUnliking = action === "unlike";
			setOptimisticLiked(!isUnliking);
			setOptimisticLikeCount((prev) => (isUnliking ? Math.max(0, prev - 1) : prev + 1));
		},
		onError: () => {
			setOptimisticLiked(activity.isLiked);
			setOptimisticLikeCount(Number(activity.likeCount) || 0);
			toast.error("Failed to update like");
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getActivityFeed.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getPublicActivityFeed.key(),
			});
		},
	});

	const commentMutation = useMutation({
		mutationFn: (content: string) =>
			client.profile.addComment({ activityId: activity.id, content }),
		onSuccess: () => {
			setCommentText("");
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getComments.queryOptions({
					input: { activityId: activity.id },
				}).queryKey,
			});
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getActivityFeed.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getPublicActivityFeed.key(),
			});
		},
		onError: () => toast.error("Failed to add comment"),
	});

	const handleSubmitComment = () => {
		if (!commentText.trim()) return;
		commentMutation.mutate(commentText.trim());
	};

	return (
		<div
			className={`flex flex-col rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm shadow-sm transition-all hover:bg-card/80 hover:border-border/80 ring-1 ring-white/5 overflow-hidden ${
				showComments ? "xl:col-span-2" : ""
			}`}
		>
			<Link
				to="/dashboard/books/$uuid"
				params={{ uuid: activity.bookUuid }}
				className="group flex gap-4 p-3"
			>
				{/* Cover thumbnail */}
				<div className="h-[80px] w-[54px] shrink-0 overflow-hidden rounded-md bg-muted shadow-black/20 shadow-sm ring-1 ring-white/10">
					{coverFilename ? (
						<img
							src={getCoverPresetUrl(coverFilename, coverPresets.activity)}
							srcSet={getCoverSrcSet(coverFilename, coverPresets.activity.widths)}
							sizes={coverPresets.activity.sizes}
							alt={displayTitle}
							className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
							loading="lazy"
							decoding="async"
							width={108}
							height={160}
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
							No cover
						</div>
					)}
				</div>

				{/* Activity info */}
				<div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
					<div className="flex items-center gap-2">
						<Icon className={`size-3.5 shrink-0 ${config.color}`} />
						<span className="text-muted-foreground text-xs font-medium">{config.label}</span>
					</div>
					<p className="line-clamp-2 font-medium text-sm text-foreground/90 group-hover:text-foreground">
						{displayTitle}
					</p>
				</div>

				{/* Timestamp */}
				<div className="flex shrink-0 items-start pt-1">
					<span className="text-muted-foreground text-[11px] font-medium">
						{formatRelativeTime(activity.createdAt)}
					</span>
				</div>
			</Link>

			{/* Actions bar */}
			<div className="flex items-center gap-1 border-t border-border/40 px-3 py-1.5 bg-background/20">
				<button
					type="button"
					className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${optimisticLiked
						? "text-destructive"
						: "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
						}`}
					onClick={() => likeMutation.mutate(optimisticLiked ? "unlike" : "like")}
					disabled={likeMutation.isPending}
				>
					<Heart
						className={`size-3.5 ${optimisticLiked ? "fill-current" : ""}`}
					/>
					{optimisticLikeCount > 0 && (
						<span>{optimisticLikeCount}</span>
					)}
				</button>

				<button
					type="button"
					className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showComments
						? "text-chart-1 bg-chart-1/10"
						: "text-muted-foreground hover:text-chart-1 hover:bg-chart-1/10"
						}`}
					onClick={() => setShowComments(!showComments)}
				>
					<MessageCircle className="size-3.5" />
					{Number(activity.commentCount) > 0 && (
						<span>{Number(activity.commentCount)}</span>
					)}
				</button>
			</div>

			{/* Comments section */}
			{showComments && (
				<div className="border-t border-border/40 px-4 py-3 bg-background/40">
					<CommentsList
						activityId={activity.id}
						currentUserId={currentUserId}
					/>

					{/* Add comment */}
					<div className="mt-3 flex gap-2">
						<input
							type="text"
							value={commentText}
							onChange={(e) => setCommentText(e.target.value)}
							placeholder="Write a comment..."
							maxLength={500}
							className="flex-1 rounded-md border border-border/50 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSubmitComment();
								}
							}}
						/>
						<Button
							size="sm"
							variant="ghost"
							onClick={handleSubmitComment}
							disabled={commentMutation.isPending || !commentText.trim()}
							className="rounded-md"
						>
							<Send className="size-3.5 text-muted-foreground hover:text-foreground" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function CommentsList({
	activityId,
	currentUserId,
}: { activityId: number; currentUserId?: string }) {
	const queryClient = useQueryClient();

	const commentsQuery = useQuery(
		orpc.profile.getComments.queryOptions({
			input: { activityId, limit: 20 },
		}),
	);

	const deleteCommentMutation = useMutation({
		mutationFn: (commentId: number) =>
			client.profile.deleteComment({ commentId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getComments.queryOptions({
					input: { activityId },
				}).queryKey,
			});
		},
	});

	if (commentsQuery.isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-8 w-full bg-border/40" />
				<Skeleton className="h-8 w-3/4 bg-border/40" />
			</div>
		);
	}

	const comments = commentsQuery.data;
	if (!comments || comments.length === 0) {
		return (
			<p className="text-muted-foreground text-xs italic">No comments yet.</p>
		);
	}

	return (
		<div className="space-y-3">
			{comments.map((comment) => (
				<div key={comment.id} className="group flex gap-2">
					<Link
						to="/dashboard/user/$username"
						params={{ username: comment.userUsername }}
						className="shrink-0"
					>
						<UserAvatar
							name={comment.userName}
							image={comment.userImage}
							className="size-6 shadow-sm"
							fallbackClassName="text-[9px]"
						/>
					</Link>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<Link
								to="/dashboard/user/$username"
								params={{ username: comment.userUsername }}
								className="font-medium text-xs text-foreground/90 hover:underline"
							>
								{comment.userName}
							</Link>
							<span className="text-muted-foreground text-[10px]">
								{formatRelativeTime(comment.createdAt)}
							</span>
						</div>
						<p className="text-sm text-foreground/80 mt-0.5">{comment.content}</p>
					</div>
					{currentUserId === comment.userId && (
						<button
							type="button"
							onClick={() => deleteCommentMutation.mutate(comment.id)}
							className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
							aria-label="Delete comment"
						>
							<Trash2 className="size-3.5" />
						</button>
					)}
				</div>
			))}
		</div>
	);
}
