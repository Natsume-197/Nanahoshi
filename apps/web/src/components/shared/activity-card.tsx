import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
} as const;

export type BaseActivity = {
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

	useEffect(() => {
		setOptimisticLiked(activity.isLiked);
		setOptimisticLikeCount(Number(activity.likeCount) || 0);
	}, [activity.isLiked, activity.likeCount]);

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
		<Card className="flex flex-col p-3 pb-3 sm:p-4">
			<div className="flex gap-3 sm:gap-4">
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

				<div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
					<div>
						<div className="flex w-full items-start justify-between gap-4">
							{user ? (
								<Link
									to="/dashboard/user/$username"
									params={{ username: user.username }}
									className="truncate font-medium text-[15px] text-foreground transition-colors hover:text-primary sm:text-[16px]"
									title={user.name}
								>
									{user.name}
								</Link>
							) : (
								<span className="font-medium text-[14px] text-foreground">
									System
								</span>
							)}
							<span className="whitespace-nowrap pt-1 font-medium text-[12px] text-muted-foreground">
								{formatRelativeTime(activity.createdAt)}
							</span>
						</div>
						<div className="mt-1 sm:mt-1.5">
							<div className="line-clamp-2 text-wrap break-words text-[14px] leading-snug">
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
							</div>
						</div>
					</div>

					<div className="mt-1 -mb-2 flex items-center justify-between sm:mt-2">
						<div className="shrink-0 leading-none">
							{user && (
								<Link
									to="/dashboard/user/$username"
									params={{ username: user.username }}
									className="-ml-2 flex min-h-[44px] min-w-[44px] items-center justify-center sm:m-0 sm:min-h-0 sm:min-w-0"
								>
									<UserAvatar
										name={user.name}
										image={user.image}
										className="size-7 rounded-md sm:size-8"
										fallbackClassName="text-[10px]"
									/>
								</Link>
							)}
						</div>

						<div className="-mr-3 flex items-center text-[13px] text-muted-foreground sm:-mr-2">
							<button
								type="button"
								aria-expanded={showComments}
								aria-controls={`activity-${activity.id}-comments`}
								className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 transition-colors sm:px-2 ${showComments ? "text-primary" : "hover:text-foreground"}`}
								onClick={() => setShowComments(!showComments)}
							>
								<span>{Number(activity.commentCount) || 0}</span>
								<MessageCircle className="size-[15px]" />
							</button>

							<button
								type="button"
								aria-pressed={optimisticLiked}
								className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 transition-colors sm:px-2 ${optimisticLiked ? "text-destructive" : "hover:text-foreground"}`}
								onClick={() =>
									likeMutation.mutate(optimisticLiked ? "unlike" : "like")
								}
								disabled={likeMutation.isPending}
							>
								<span>{optimisticLikeCount > 0 ? optimisticLikeCount : 0}</span>
								<Heart
									className={`size-[15px] ${optimisticLiked ? "fill-current" : ""}`}
								/>
							</button>
						</div>
					</div>
				</div>
			</div>

			{showComments && (
				<div
					id={`activity-${activity.id}-comments`}
					className="fade-in relative z-10 mt-4 flex animate-in px-1"
				>
					<div className="w-[85px] shrink-0 sm:w-[100px]" />{" "}
					{/* Indent matches cover width less some padding */}
					<div className="min-w-0 flex-1 border-border border-l pl-4 sm:pl-5">
						<CommentsList
							activityId={activity.id}
							currentUserId={currentUserId}
						/>

						<div className="mt-2 flex items-center gap-1 sm:gap-2">
							<input
								type="text"
								aria-label="Add a comment"
								value={commentText}
								onChange={(e) => setCommentText(e.target.value)}
								placeholder="Share your thoughts..."
								maxLength={500}
								className="h-11 flex-1 rounded border-input border-b bg-transparent px-0 py-2.5 text-[13px] transition-colors focus:border-primary focus:outline-none sm:text-[14px]"
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
								className="h-11 w-11 shrink-0 rounded hover:bg-transparent hover:text-primary"
								aria-label="Submit comment"
							>
								<Send className="size-4" />
							</Button>
						</div>
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
				<p className="mb-1 text-[13px] text-destructive">
					Failed to load comments.
				</p>
				<button
					type="button"
					onClick={() => commentsQuery.refetch()}
					className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
				>
					Try again
				</button>
			</div>
		);
	}

	const comments = commentsQuery.data;
	if (!comments || comments.length === 0) {
		return (
			<p className="py-1 text-center text-[13px] text-muted-foreground italic">
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
								className="max-w-[120px] truncate font-medium text-[12px] text-foreground hover:underline sm:max-w-[200px]"
								title={comment.userName}
							>
								{comment.userName}
							</Link>
							<span className="shrink-0 text-[10px] text-muted-foreground">
								{formatRelativeTime(comment.createdAt)}
							</span>
						</div>
						<p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-muted-foreground leading-snug">
							{comment.content}
						</p>
					</div>
					{currentUserId === comment.userId && (
						<button
							type="button"
							onClick={() => deleteCommentMutation.mutate(comment.id)}
							className="-m-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center self-start rounded text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring sm:m-0 sm:min-h-0 sm:min-w-0 sm:p-1.5 sm:opacity-0 sm:group-hover:opacity-100"
							aria-label="Delete comment"
						>
							<Trash2 className="size-4 sm:size-3" />
						</button>
					)}
				</div>
			))}
		</div>
	);
}
