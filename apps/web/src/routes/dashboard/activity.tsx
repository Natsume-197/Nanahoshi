import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
	BookCheck,
	BookOpen,
	Heart,
	MessageCircle,
	Send,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useCallback, useState } from "react";
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
import { client, orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard/activity")({
	component: FeedPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
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
					className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "global"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground"
						}`}
				>
					Global
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("following")}
					className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "following"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground"
						}`}
				>
					Following
				</button>
			</div>

			<FeedList type={activeTab} currentUserId={session?.user?.id} />
		</div>
	)
}

function FeedList({
	type,
	currentUserId,
}: { type: FeedType; currentUserId?: string }) {

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
	} = useInfiniteQuery(
		orpc.profile.getSocialFeed.infiniteOptions({
			input: (pageParam?: number) => ({ type, limit: 15, cursor: pageParam }),
			getNextPageParam: (lastPage) =>
				lastPage.length === 15 ? lastPage[lastPage.length - 1].id : undefined,
			initialPageParam: undefined,
		}),
	)

	const feed = data?.pages.flat() || [];

	const observerTarget = useRef<HTMLDivElement>(null);

	const handleObserver = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [target] = entries;
			if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
				fetchNextPage();
			}
		},
		[fetchNextPage, hasNextPage, isFetchingNextPage],
	)

	useEffect(() => {
		const element = observerTarget.current;
		const option = { threshold: 0 };
		const observer = new IntersectionObserver(handleObserver, option);

		if (element) observer.observe(element);
		return () => {
			if (element) observer.unobserve(element);
		}
	}, [handleObserver]);

	if (isLoading) {
		return (
			<div className="space-y-4">
				{[1, 2, 3, 4].map((i) => (
					<Skeleton key={i} className="h-32 w-full rounded-xl" />
				))}
			</div>
		)
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
		)
	}

	return (
		<div className="space-y-3">
			{feed.map((item) => (
				<SocialActivityCard
					key={item.id}
					activity={item}
					currentUserId={currentUserId}
				/>
			))}

			<div ref={observerTarget} className="py-4 text-center">
				{isFetchingNextPage && (
					<div className="text-muted-foreground text-sm">
						Loading more...
					</div>
				)}
				{!hasNextPage && feed.length > 0 && (
					<div className="text-muted-foreground text-sm">
						You've reached the end
					</div>
				)}
			</div>
		</div>
	)
}

type SocialActivity = {
	id: number;
	type: "started_reading" | "completed_reading" | "liked_book";
	createdAt: string;
	bookUuid: string;
	title: string | null;
	cover: string | null;
	userId: string;
	userName: string;
	userImage: string | null;
	userUsername: string;
	userDisplayUsername: string | null;
	likeCount: number;
	commentCount: number;
	isLiked: boolean;
};

function SocialActivityCard({
	activity,
	currentUserId,
}: {
	activity: SocialActivity;
	currentUserId?: string;
}) {
	const queryClient = useQueryClient();
	const [showComments, setShowComments] = useState(false);
	const [commentText, setCommentText] = useState("");
	const [optimisticLiked, setOptimisticLiked] = useState(activity.isLiked);
	const [optimisticLikeCount, setOptimisticLikeCount] = useState(
		Number(activity.likeCount) || 0,
	)

	useEffect(() => {
		setOptimisticLiked(activity.isLiked);
		setOptimisticLikeCount(Number(activity.likeCount) || 0);
	}, [activity.isLiked, activity.likeCount]);

	const config = activityConfig[activity.type];
	const Icon = config.icon;
	const coverFilename = activity.cover?.split("/").pop();
	const displayTitle = activity.title ?? "Untitled";
	const displayUsername =
		activity.userDisplayUsername ?? activity.userUsername;

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
				queryKey: orpc.profile.getSocialFeed.key(),
			})
		},
	})

	const commentMutation = useMutation({
		mutationFn: (content: string) =>
			client.profile.addComment({ activityId: activity.id, content }),
		onSuccess: () => {
			setCommentText("");
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getComments.queryOptions({
					input: { activityId: activity.id },
				}).queryKey,
			})
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getSocialFeed.key(),
			})
		},
		onError: () => toast.error("Failed to add comment"),
	})

	const handleSubmitComment = () => {
		if (!commentText.trim()) return;
		commentMutation.mutate(commentText.trim());
	}

	return (
		<div className="rounded-xl border border-border/50 bg-card shadow-black/10 shadow-sm transition-all hover:border-border">
			{/* User header */}
			<div className="flex items-center gap-3 px-4 pt-4 pb-2">
				<Link
					to="/dashboard/user/$username"
					params={{ username: activity.userUsername }}
					className="shrink-0"
				>
					<UserAvatar
						name={activity.userName}
						image={activity.userImage}
						className="size-8"
						fallbackClassName="text-xs"
					/>
				</Link>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<Link
							to="/dashboard/user/$username"
							params={{ username: activity.userUsername }}
							className="truncate font-medium text-sm hover:underline"
						>
							{activity.userName}
						</Link>
						<span className="text-muted-foreground text-xs">
							@{displayUsername}
						</span>
					</div>
					<div className="flex items-center gap-1.5">
						<Icon className={`size-3 ${config.color}`} />
						<span className="text-muted-foreground text-xs">
							{config.label}
						</span>
						<span className="text-muted-foreground text-xs">·</span>
						<span className="text-muted-foreground text-xs">
							{formatRelativeTime(activity.createdAt)}
						</span>
					</div>
				</div>
			</div>

			{/* Book info */}
			<Link
				to="/dashboard/books/$uuid"
				params={{ uuid: activity.bookUuid }}
				className="group mx-4 mb-3 flex gap-3 rounded-lg bg-muted/30 p-2.5 transition-colors hover:bg-muted/50"
			>
				<div className="h-[72px] w-[48px] shrink-0 overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-white/[0.03]">
					{coverFilename ? (
						<img
							src={getCoverPresetUrl(coverFilename, coverPresets.activity)}
							srcSet={getCoverSrcSet(
								coverFilename,
								coverPresets.activity.widths,
							)}
							sizes={coverPresets.activity.sizes}
							alt={displayTitle}
							className="h-full w-full object-cover"
							loading="lazy"
							decoding="async"
							width={96}
							height={144}
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
							No cover
						</div>
					)}
				</div>
				<div className="flex min-w-0 flex-col justify-center">
					<p className="line-clamp-2 font-medium text-sm group-hover:text-foreground">
						{displayTitle}
					</p>
				</div>
			</Link>

			{/* Actions bar */}
			<div className="flex items-center gap-1 border-border/50 border-t px-3 py-1.5">
				<button
					type="button"
					className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${optimisticLiked
						? "text-destructive"
						: "text-muted-foreground hover:text-destructive"
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
					className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${showComments
						? "text-chart-1"
						: "text-muted-foreground hover:text-chart-1"
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
				<div className="border-border/50 border-t px-4 py-3">
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
							className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault()
									handleSubmitComment()
								}
							}}
						/>
						<Button
							size="sm"
							variant="ghost"
							onClick={handleSubmitComment}
							disabled={
								commentMutation.isPending || !commentText.trim()
							}
						>
							<Send className="size-3.5" />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
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
	)

	const deleteCommentMutation = useMutation({
		mutationFn: (commentId: number) =>
			client.profile.deleteComment({ commentId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getComments.queryOptions({
					input: { activityId },
				}).queryKey,
			})
		},
	})

	if (commentsQuery.isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-3/4" />
			</div>
		)
	}

	const comments = commentsQuery.data;
	if (!comments || comments.length === 0) {
		return (
			<p className="text-muted-foreground text-xs">No comments yet</p>
		)
	}

	return (
		<div className="space-y-2">
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
							className="size-6"
							fallbackClassName="text-[9px]"
						/>
					</Link>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<Link
								to="/dashboard/user/$username"
								params={{ username: comment.userUsername }}
								className="font-medium text-xs hover:underline"
							>
								{comment.userName}
							</Link>
							<span className="text-muted-foreground text-[10px]">
								{formatRelativeTime(comment.createdAt)}
							</span>
						</div>
						<p className="text-sm">{comment.content}</p>
					</div>
					{currentUserId === comment.userId && (
						<button
							type="button"
							onClick={() =>
								deleteCommentMutation.mutate(comment.id)
							}
							className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
							aria-label="Delete comment"
						>
							<Trash2 className="size-3" />
						</button>
					)}
				</div>
			))}
		</div>
	)
}
