import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatRelativeTime, getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

export const activityConfig = {
	started_reading: {
		label: "Started reading",
		color: "text-chart-1",
	},
	completed_reading: {
		label: "Finished reading",
		color: "text-chart-4",
	},
	liked_book: {
		label: "Liked this book",
		color: "text-destructive",
	},
	started_listening: {
		label: "Started listening",
		color: "text-chart-1",
	},
	completed_listening: {
		label: "Finished listening",
		color: "text-chart-4",
	},
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
	onInvalidate: () => void;
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

	const config = activityConfig[activity.type];
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
			onInvalidate();
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
			onInvalidate();
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, "Failed to add comment")),
	});

	const handleSubmitComment = () => {
		if (!commentText.trim()) return;
		commentMutation.mutate(commentText.trim());
	};

	return (
		<Card className="flex flex-col p-3 sm:p-4">
			<div className="flex gap-3 sm:gap-4">
				{/* Cover */}
				<Link
					to="/dashboard/books/$uuid"
					params={{ uuid: activity.bookUuid }}
					className="group relative block aspect-[2/3] w-[75px] shrink-0 overflow-hidden rounded-sm bg-muted ring-1 ring-border sm:w-[90px]"
				>
					{coverFilename ? (
						<img
							src={getCoverPresetUrl(coverFilename, coverPresets.activity)}
							srcSet={getCoverSrcSet(
								coverFilename,
								coverPresets.activity.widths,
							)}
							sizes={coverPresets.activity.sizes}
							alt={displayTitle}
							className="absolute inset-0 h-full w-full object-cover"
							loading="lazy"
							decoding="async"
						/>
					) : (
						<div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted p-2 text-center text-muted-foreground">
							<BookOpen className="size-5 opacity-60" />
							<span className="sr-only">Cover unavailable</span>
						</div>
					)}
				</Link>

				{/* Content */}
				<div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
					<div>
						<div className="flex w-full items-start justify-between gap-4">
							{user ? (
								<Link
									to="/dashboard/user/$username"
									params={{ username: user.username }}
									className="truncate font-medium text-foreground text-sm transition-colors hover:text-primary"
									title={user.name}
								>
									{user.name}
								</Link>
							) : (
								<span className="font-medium text-foreground text-sm">
									System
								</span>
							)}
							<span className="shrink-0 pt-0.5 text-muted-foreground text-xs">
								{formatRelativeTime(activity.createdAt)}
							</span>
						</div>
						<div className="mt-1 sm:mt-1.5">
							<p className="line-clamp-2 break-words text-sm leading-snug">
								<span className="mr-1.5 text-muted-foreground">
									{config.label}
								</span>
								<Link
									to="/dashboard/books/$uuid"
									params={{ uuid: activity.bookUuid }}
									className="inline font-medium text-foreground transition-colors hover:text-primary"
									title={displayTitle}
								>
									{displayTitle}
								</Link>
							</p>
						</div>
						{user && (
							<Link
								to="/dashboard/user/$username"
								params={{ username: user.username }}
								className="mt-2 block"
								aria-label={`${user.name}'s profile`}
							>
								<UserAvatar
									name={user.name}
									image={user.image}
									className="size-7 rounded-none sm:size-9"
									fallbackClassName="text-[10px]"
								/>
							</Link>
						)}
					</div>

					{/* Actions */}
					<div className="mt-2 flex items-center justify-end">
						<div className="flex items-center gap-1 text-muted-foreground">
							<Button
								variant="ghost"
								size="sm"
								aria-expanded={showComments}
								aria-controls={`activity-${activity.id}-comments`}
								className={`min-h-[44px] min-w-[44px] gap-1.5 sm:min-h-0 sm:min-w-0 ${showComments ? "text-primary" : ""}`}
								onClick={() => setShowComments(!showComments)}
							>
								<MessageCircle className="size-3.5" />
								<span>{Number(activity.commentCount) || 0}</span>
							</Button>

							<Button
								variant="ghost"
								size="sm"
								aria-pressed={optimisticLiked}
								aria-label={optimisticLiked ? "Unlike" : "Like"}
								className={`min-h-[44px] min-w-[44px] gap-1.5 sm:min-h-0 sm:min-w-0 ${optimisticLiked ? "text-destructive" : ""}`}
								onClick={() =>
									likeMutation.mutate(optimisticLiked ? "unlike" : "like")
								}
								disabled={likeMutation.isPending}
							>
								<Heart
									className={`size-3.5 ${optimisticLiked ? "fill-current" : ""}`}
								/>
								<span>{optimisticLikeCount}</span>
							</Button>
						</div>
					</div>
				</div>
			</div>

			{showComments && (
				<div
					id={`activity-${activity.id}-comments`}
					className="mt-3 border-border/60 border-t pt-3"
				>
					<CommentsList
						activityId={activity.id}
						currentUserId={currentUserId}
					/>

					<div className="mt-2 flex items-center gap-1.5">
						<Input
							aria-label="Add a comment"
							value={commentText}
							onChange={(e) => setCommentText(e.target.value)}
							placeholder="Add a comment..."
							maxLength={500}
							className="h-8 flex-1"
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
							className="size-8 shrink-0 hover:text-primary"
							aria-label="Submit comment"
						>
							<Send className="size-3.5" />
						</Button>
					</div>
				</div>
			)}
		</Card>
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
							<Trash2 className="size-4 sm:size-3" />
						</Button>
					)}
				</div>
			))}
		</div>
	);
}
