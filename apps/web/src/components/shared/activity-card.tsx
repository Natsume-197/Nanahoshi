import {
	BookOpen,
	ChatCircle,
	Heart,
	PaperPlaneTilt,
	Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookCoverThumb } from "@/components/books/book-cover-thumb";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	formatDetailedDate,
	formatRelativeTime,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

/** Verb phrase shown after the actor's name (e.g. "Natsume finished reading."). */
const ACTIVITY_SENTENCES = {
	started_reading: "started reading",
	completed_reading: "finished reading",
	liked_book: "liked a book",
	started_listening: "started listening",
	completed_listening: "finished listening",
} as const;

export type BaseActivity = {
	id: number;
	type:
		| "started_reading"
		| "completed_reading"
		| "liked_book"
		| "started_listening"
		| "completed_listening";
	createdAt: string;
	bookUuid: string;
	title: string | null;
	author: string | null;
	cover: string | null;
	likeCount: number;
	commentCount: number;
	isLiked: boolean;
};

export type ActivityUser = {
	id: string;
	name: string;
	image: string | null;
	username: string;
	displayUsername: string | null;
};

export interface ActivityCardProps {
	activity: BaseActivity;
	user?: ActivityUser;
	currentUserId?: string;
	onInvalidate?: () => void;
}

export function ActivityCard({
	activity,
	user,
	currentUserId,
	onInvalidate,
}: ActivityCardProps) {
	const queryClient = useQueryClient();
	const [showComments, setShowComments] = useState(false);
	const [commentText, setCommentText] = useState("");
	const [optimisticLiked, setOptimisticLiked] = useState(activity.isLiked);
	const [optimisticLikeCount, setOptimisticLikeCount] = useState(
		Number(activity.likeCount) || 0,
	);
	const prevActivityRef = useRef({
		isLiked: activity.isLiked,
		likeCount: activity.likeCount,
	});

	// Sync optimistic state when server data changes
	if (
		activity.isLiked !== prevActivityRef.current.isLiked ||
		activity.likeCount !== prevActivityRef.current.likeCount
	) {
		prevActivityRef.current = {
			isLiked: activity.isLiked,
			likeCount: activity.likeCount,
		};
		setOptimisticLiked(activity.isLiked);
		setOptimisticLikeCount(Number(activity.likeCount) || 0);
	}

	const displayTitle = activity.title ?? "Untitled";

	const likeMutation = useMutation({
		mutationFn: (action: "like" | "unlike") =>
			action === "unlike"
				? client.profile.unlikeActivity({ activityId: activity.id })
				: client.profile.likeActivity({ activityId: activity.id }),
		onMutate: (action) => {
			const isUnliking = action === "unlike";
			setOptimisticLiked(!isUnliking);
			setOptimisticLikeCount((prev) =>
				isUnliking ? Math.max(0, prev - 1) : prev + 1,
			);
		},
		onError: (error) => {
			setOptimisticLiked(activity.isLiked);
			setOptimisticLikeCount(Number(activity.likeCount) || 0);
			toast.error(getErrorMessage(error, "Failed to update like"));
		},
		onSuccess: () => {
			onInvalidate?.();
		},
	});

	const commentMutation = useMutation({
		mutationFn: (content: string) =>
			client.profile.addComment({ activityId: activity.id, content }),
		onSuccess: () => {
			setCommentText("");
			setShowComments(true);
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getComments.queryOptions({
					input: { activityId: activity.id },
				}).queryKey,
			});
			onInvalidate?.();
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, "Failed to add comment")),
	});

	const handleSubmitComment = () => {
		if (!commentText.trim()) return;
		commentMutation.mutate(commentText.trim());
	};

	const commentCount = Number(activity.commentCount) || 0;

	return (
		<article className="flex flex-col gap-3 border-border/50 border-b pb-5">
			{/* Header: who did what */}
			<div className="flex items-center gap-2.5">
				{user ? (
					<Link
						to="/dashboard/user/$username"
						params={{ username: user.username }}
						className="shrink-0"
						aria-label={`${user.name}'s profile`}
					>
						<UserAvatar
							name={user.name}
							image={user.image}
							className="size-10"
							fallbackClassName="text-sm"
						/>
					</Link>
				) : (
					<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
						<BookOpen className="size-4" />
					</div>
				)}
				<p className="min-w-0 text-[15px] leading-snug">
					{user ? (
						<Link
							to="/dashboard/user/$username"
							params={{ username: user.username }}
							className="font-semibold text-foreground transition-colors hover:text-primary"
							title={user.name}
						>
							{user.name}
						</Link>
					) : (
						<span className="font-semibold text-foreground">System</span>
					)}
					<span className="text-muted-foreground">
						{" "}
						{ACTIVITY_SENTENCES[activity.type]}.
					</span>
				</p>
			</div>

			{/* Book container */}
			<div className="flex gap-3.5 rounded-lg border border-border/60 bg-muted/30 p-3.5">
				<BookCoverThumb
					bookUuid={activity.bookUuid}
					cover={activity.cover}
					title={displayTitle}
					className="w-[64px] shrink-0"
					iconClassName="size-6"
				/>

				<div className="flex min-w-0 flex-1 flex-col">
					<Link
						to="/dashboard/books/$uuid"
						params={{ uuid: activity.bookUuid }}
						className="line-clamp-2 break-words font-medium text-[15px] text-primary leading-snug transition-colors hover:underline"
						title={displayTitle}
					>
						{displayTitle}
					</Link>
					{activity.author && (
						<span
							className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground"
							title={activity.author}
						>
							{activity.author}
						</span>
					)}
					<div className="pt-3">
						<Button asChild variant="outline" size="default">
							<Link
								to="/dashboard/books/$uuid"
								params={{ uuid: activity.bookUuid }}
							>
								View book
							</Link>
						</Button>
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<Button
					variant="outline"
					size="default"
					aria-pressed={optimisticLiked}
					aria-label={optimisticLiked ? "Unlike" : "Like"}
					className={`gap-1.5 ${optimisticLiked ? "border-destructive/40 text-destructive hover:text-destructive" : ""}`}
					onClick={() =>
						likeMutation.mutate(optimisticLiked ? "unlike" : "like")
					}
					disabled={likeMutation.isPending}
				>
					<Heart
						weight={optimisticLiked ? "fill" : "regular"}
						className="size-4"
					/>
					<span>Like</span>
					{optimisticLikeCount > 0 && <span>({optimisticLikeCount})</span>}
				</Button>

				<div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
					<button
						type="button"
						aria-expanded={showComments}
						aria-controls={`activity-${activity.id}-comments`}
						onClick={() => setShowComments(!showComments)}
						className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${showComments ? "text-foreground" : ""}`}
					>
						<ChatCircle className="size-4" />
						<span>Comments ({commentCount})</span>
					</button>
					<span aria-hidden="true">·</span>
					<time dateTime={activity.createdAt}>
						{formatDetailedDate(activity.createdAt)}
					</time>
				</div>
			</div>

			{/* Comments (toggled) */}
			{showComments && (
				<div
					id={`activity-${activity.id}-comments`}
					className="border-border/60 border-t pt-3"
				>
					<CommentsList
						activityId={activity.id}
						currentUserId={currentUserId}
					/>
				</div>
			)}

			{/* Comment input (always visible) */}
			<div className="flex items-center gap-1.5">
				<Input
					aria-label="Add a comment"
					value={commentText}
					onChange={(e) => setCommentText(e.target.value)}
					placeholder="Add a comment..."
					maxLength={500}
					className="h-10 flex-1 text-[15px]"
					disabled={commentMutation.isPending}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSubmitComment();
						}
					}}
				/>
				<Button
					size="icon"
					variant="ghost"
					onClick={handleSubmitComment}
					disabled={commentMutation.isPending || !commentText.trim()}
					className="size-10 shrink-0 hover:text-primary"
					aria-label="Submit comment"
				>
					<PaperPlaneTilt className="size-4" />
				</Button>
			</div>
		</article>
	);
}

export function CommentsList({
	activityId,
	currentUserId,
}: {
	activityId: number;
	currentUserId?: string;
}) {
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
		onError: (error) =>
			toast.error(getErrorMessage(error, "Failed to delete comment")),
	});

	if (commentsQuery.isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-8 w-full bg-muted" />
				<Skeleton className="h-8 w-3/4 bg-muted" />
			</div>
		);
	}

	if (commentsQuery.isError) {
		return (
			<div className="py-3 text-center">
				<p className="mb-1 text-destructive text-xs">
					Failed to load comments.
				</p>
				<Button
					variant="link"
					size="sm"
					onClick={() => commentsQuery.refetch()}
					className="text-muted-foreground text-xs"
				>
					Try again
				</Button>
			</div>
		);
	}

	const comments = commentsQuery.data;
	if (!comments || comments.length === 0) {
		return (
			<p className="py-1 text-center text-muted-foreground text-xs italic">
				No comments yet. Be the first to share your thoughts!
			</p>
		);
	}

	return (
		<div className="mt-1 mb-2 space-y-2">
			{comments.map((comment) => (
				<div key={comment.id} className="group flex gap-2">
					<Link
						to="/dashboard/user/$username"
						params={{ username: comment.userUsername }}
						className="shrink-0 pt-0.5"
						aria-label={`${comment.userName}'s profile`}
					>
						<UserAvatar
							name={comment.userName}
							image={comment.userImage}
							className="size-5 shadow-sm"
							fallbackClassName="text-[9px]"
						/>
					</Link>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline gap-1.5">
							<Link
								to="/dashboard/user/$username"
								params={{ username: comment.userUsername }}
								className="max-w-[120px] truncate font-medium text-foreground text-xs hover:underline sm:max-w-[200px]"
								title={comment.userName}
							>
								{comment.userName}
							</Link>
							<span className="shrink-0 text-[10px] text-muted-foreground">
								{formatRelativeTime(comment.createdAt)}
							</span>
						</div>
						<p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground text-sm leading-snug">
							{comment.content}
						</p>
					</div>
					{currentUserId === comment.userId && (
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => deleteCommentMutation.mutate(comment.id)}
							className="-m-2 min-h-[44px] min-w-[44px] shrink-0 self-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:m-0 sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover:opacity-100"
							aria-label="Delete comment"
						>
							<Trash className="size-4 sm:size-3" />
						</Button>
					)}
				</div>
			))}
		</div>
	);
}
