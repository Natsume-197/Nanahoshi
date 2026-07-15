import {
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
import { cn } from "@/lib/utils";
import {
	formatDetailedDate,
	formatRelativeTime,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

const ACTIVITY_SENTENCES = {
	started_reading: "started reading",
	completed_reading: "finished reading",
	liked_book: "liked",
	started_listening: "started listening to",
	completed_listening: "finished listening to",
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
	const activitySentence = ACTIVITY_SENTENCES[activity.type];
	const actorLabel = user?.name ?? "You";

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
		<article
			aria-label={`${actorLabel} ${activitySentence} ${displayTitle}`}
			className="overflow-hidden rounded-xl border border-border/60 bg-card/50 transition-[border-color,background-color] duration-200 hover:border-border hover:bg-card/70"
		>
			<div className="group/book flex min-h-24">
				<BookCoverThumb
					bookUuid={activity.bookUuid}
					cover={activity.cover}
					title={displayTitle}
					className="w-16 shrink-0 self-stretch rounded-none shadow-sm ring-0"
					iconClassName="size-5"
					preload
				/>

				<div className="flex min-w-0 flex-1 flex-col p-3">
					<div className="flex min-w-0 items-start gap-2">
						<Link
							to="/dashboard/books/$uuid"
							params={{ uuid: activity.bookUuid }}
							preload="intent"
							className="line-clamp-3 min-w-0 break-words font-medium text-foreground text-sm leading-relaxed transition-colors group-hover/book:text-primary"
							title={displayTitle}
						>
							<span className="capitalize">{activitySentence}</span>{" "}
							{displayTitle}
						</Link>
						<time
							dateTime={activity.createdAt}
							title={formatDetailedDate(activity.createdAt)}
							className="ml-auto shrink-0 font-medium text-muted-foreground text-xs tabular-nums"
						>
							{formatRelativeTime(activity.createdAt)}
						</time>
					</div>

					<div className="mt-auto flex items-center justify-end gap-0.5 pt-1">
						<Button
							variant="ghost"
							size="xs"
							aria-label={`Comments (${commentCount})`}
							aria-expanded={showComments}
							aria-controls={`activity-${activity.id}-comments`}
							onClick={() => setShowComments(!showComments)}
							className="h-6 rounded-lg px-1.5 text-muted-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
						>
							<ChatCircle data-icon="inline-start" />
							<span className="tabular-nums">{commentCount}</span>
						</Button>

						<Button
							variant="ghost"
							size="xs"
							aria-pressed={optimisticLiked}
							aria-label={optimisticLiked ? "Unlike" : "Like"}
							className={cn(
								"h-6 rounded-lg px-1.5 text-muted-foreground",
								optimisticLiked &&
									"bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
							)}
							onClick={() =>
								likeMutation.mutate(optimisticLiked ? "unlike" : "like")
							}
							disabled={likeMutation.isPending}
						>
							<Heart
								data-icon="inline-start"
								weight={optimisticLiked ? "fill" : "regular"}
							/>
							<span className="tabular-nums">{optimisticLikeCount}</span>
						</Button>
					</div>
				</div>
			</div>

			{/* Reading and writing comments share one quiet secondary surface. */}
			{showComments && (
				<div
					id={`activity-${activity.id}-comments`}
					className="mx-3 mb-3 flex flex-col gap-3 border-border/50 border-t pt-3"
				>
					<CommentsList
						activityId={activity.id}
						currentUserId={currentUserId}
					/>

					<form
						className="flex items-center gap-1.5"
						onSubmit={(event) => {
							event.preventDefault();
							handleSubmitComment();
						}}
					>
						<Input
							aria-label="Add a comment"
							value={commentText}
							onChange={(event) => setCommentText(event.target.value)}
							placeholder="Add a comment..."
							maxLength={500}
							className="h-9 flex-1 bg-background/70"
							disabled={commentMutation.isPending}
						/>
						<Button
							type="submit"
							size="icon-lg"
							variant="ghost"
							disabled={commentMutation.isPending || !commentText.trim()}
							className="shrink-0 hover:text-primary"
							aria-label="Submit comment"
						>
							<PaperPlaneTilt />
						</Button>
					</form>
				</div>
			)}
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
			<div className="flex flex-col gap-2">
				<Skeleton className="h-8 w-full bg-muted" />
				<Skeleton className="h-8 w-3/4 bg-muted" />
			</div>
		);
	}

	if (commentsQuery.isError) {
		return (
			<div className="py-3 text-center">
				<p className="text-destructive text-xs">Failed to load comments.</p>
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
		<div className="flex flex-col gap-3">
			{comments.map((comment) => (
				<div key={comment.id} className="group flex gap-2.5">
					<Link
						to="/dashboard/user/$username"
						params={{ username: comment.userUsername }}
						className="shrink-0 pt-0.5"
						aria-label={`${comment.userName}'s profile`}
					>
						<UserAvatar
							name={comment.userName}
							image={comment.userImage}
							className="size-6 shadow-sm"
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
							<Trash />
						</Button>
					)}
				</div>
			))}
		</div>
	);
}
