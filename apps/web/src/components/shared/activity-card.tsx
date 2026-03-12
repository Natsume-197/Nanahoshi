import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookCheck, BookOpen, Heart, MessageCircle, Send, Trash2 } from "lucide-react";
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
import { client, orpc } from "@/utils/orpc";

export function formatRelativeTime(dateStr: string) {
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
			setOptimisticLikeCount((prev) => (isUnliking ? Math.max(0, prev - 1) : prev + 1));
		},
		onError: (error: Error) => {
			setOptimisticLiked(activity.isLiked);
			setOptimisticLikeCount(Number(activity.likeCount) || 0);
			toast.error(error.message || "Failed to update like");
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
		onError: (error: Error) => toast.error(error.message || "Failed to add comment"),
	});

	const handleSubmitComment = () => {
		if (!commentText.trim()) return;
		commentMutation.mutate(commentText.trim());
	};

	return (
		<div className="flex flex-col bg-card rounded-md shadow-sm border border-border mb-4 p-3 sm:p-4 pb-3">
			<div className="flex gap-3 sm:gap-4">
				{/* Left side: Cover */}
				<Link
					to="/dashboard/books/$uuid"
					params={{ uuid: activity.bookUuid }}
					className="bg-muted relative group shrink-0 w-[75px] sm:w-[90px] aspect-[2/3] block rounded-sm overflow-hidden ring-1 ring-border"
				>
					{coverFilename ? (
						<img
							src={getCoverPresetUrl(coverFilename, coverPresets.activity)}
							srcSet={getCoverSrcSet(coverFilename, coverPresets.activity.widths)}
							sizes={coverPresets.activity.sizes}
							alt={displayTitle}
							className="absolute inset-0 h-full w-full object-cover"
							loading="lazy"
							decoding="async"
						/>
					) : (
						<div className="flex absolute inset-0 h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground p-2 text-center bg-muted">
							<BookOpen className="size-5 opacity-60" />
							<span className="sr-only">Cover unavailable</span>
						</div>
					)}
				</Link>

				{/* Right side: Content */}
				<div className="flex flex-1 flex-col min-w-0 justify-between py-0.5">
					<div>
						{/* Top Row: Username and Time */}
						<div className="flex items-start justify-between gap-4 w-full">
							{user ? (
								<Link
									to="/dashboard/user/$username"
									params={{ username: user.username }}
									className="font-medium text-foreground hover:text-primary transition-colors text-[15px] sm:text-[16px] truncate"
									title={user.name}
								>
									{user.name}
								</Link>
							) : (
								<span className="font-medium text-foreground text-[14px]">
									System
								</span>
							)}
							<span className="text-muted-foreground text-[12px] whitespace-nowrap pt-1 font-medium">
								{formatRelativeTime(activity.createdAt)}
							</span>
						</div>

						{/* Middle Row: Action and Book Title */}
						<div className="mt-1 sm:mt-1.5">
							<div className="text-[14px] leading-snug line-clamp-2 break-words text-wrap">
								<span className="text-muted-foreground mr-1.5">{config.label}</span>
								<Link
									to="/dashboard/books/$uuid"
									params={{ uuid: activity.bookUuid }}
									className="text-foreground hover:text-primary transition-colors inline font-medium"
									title={displayTitle}
								>
									{displayTitle}
								</Link>
							</div>
						</div>
					</div>

					{/* Bottom Row: User Avatar (Left) vs Interactions (Right) */}
					<div className="flex items-center justify-between mt-1 sm:mt-2 -mb-2">
						<div className="shrink-0 leading-none">
							{user && (
								<Link
									to="/dashboard/user/$username"
									params={{ username: user.username }}
									className="flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2 sm:min-h-0 sm:min-w-0 sm:m-0"
								>
									<UserAvatar
										name={user.name}
										image={user.image}
										className="size-7 sm:size-8 rounded-md"
										fallbackClassName="text-[10px]"
									/>
								</Link>
							)}
						</div>

						{/* Actions bar (Interactions) right-aligned */}
						<div className="flex items-center text-[13px] text-muted-foreground -mr-3 sm:-mr-2">
							{/* Comments count */}
							<button
								type="button"
								aria-expanded={showComments}
								aria-controls={`activity-${activity.id}-comments`}
								className={`flex items-center justify-center min-h-[44px] min-w-[44px] gap-1.5 px-3 sm:px-2 transition-colors ${showComments ? "text-primary" : "hover:text-foreground"}`}
								onClick={() => setShowComments(!showComments)}
							>
								<span>{Number(activity.commentCount) || 0}</span>
								<MessageCircle className="size-[15px]" />
							</button>

							{/* Like count */}
							<button
								type="button"
								aria-pressed={optimisticLiked}
								className={`flex items-center justify-center min-h-[44px] min-w-[44px] gap-1.5 px-3 sm:px-2 transition-colors ${optimisticLiked ? "text-destructive" : "hover:text-foreground"}`}
								onClick={() => likeMutation.mutate(optimisticLiked ? "unlike" : "like")}
								disabled={likeMutation.isPending}
							>
								<span>{optimisticLikeCount > 0 ? optimisticLikeCount : 0}</span>
								<Heart className={`size-[15px] ${optimisticLiked ? "fill-current" : ""}`} />
							</button>
						</div>
					</div>
				</div>
			</div>

		{/* Comments Section Drawer */}
			{showComments && (
				<div
					id={`activity-${activity.id}-comments`}
					className="mt-4 px-1 relative z-10 animate-in fade-in flex"
				>
					<div className="w-[85px] sm:w-[100px] shrink-0" /> {/* Indent matches cover width less some padding */}
					<div className="flex-1 min-w-0 border-l border-border pl-4 sm:pl-5">
					<CommentsList
						activityId={activity.id}
						currentUserId={currentUserId}
					/>

					{/* Add comment input */}
					<div className="mt-2 flex gap-1 sm:gap-2 items-center">
						<input
							type="text"
							aria-label="Add a comment"
							value={commentText}
							onChange={(e) => setCommentText(e.target.value)}
							placeholder="Share your thoughts..."
							maxLength={500}
							className="flex-1 rounded border-b border-input bg-transparent px-0 py-2.5 text-[13px] sm:text-[14px] focus:outline-none focus:border-primary transition-colors h-11"
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
							className="rounded h-11 w-11 shrink-0 hover:bg-transparent hover:text-primary"
							aria-label="Submit comment"
						>
							<Send className="size-4" />
						</Button>
						</div>
					</div>
				</div>
			)}
		</div>
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
		onError: (error: Error) => toast.error(error.message || "Failed to delete comment"),
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
				<p className="text-destructive text-[13px] mb-1">Failed to load comments.</p>
				<button 
					type="button" 
					onClick={() => commentsQuery.refetch()}
					className="text-muted-foreground text-[12px] hover:text-foreground underline underline-offset-2"
				>
					Try again
				</button>
			</div>
		);
	}

	const comments = commentsQuery.data;
	if (!comments || comments.length === 0) {
		return (
			<p className="text-muted-foreground text-[13px] italic py-1 text-center">
				No comments yet. Be the first to share your thoughts!
			</p>
		);
	}

	return (
		<div className="space-y-2 mt-1 mb-2">
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
								className="font-medium text-[12px] text-foreground hover:underline truncate max-w-[120px] sm:max-w-[200px]"
								title={comment.userName}
							>
								{comment.userName}
							</Link>
							<span className="text-muted-foreground text-[10px] shrink-0">
								{formatRelativeTime(comment.createdAt)}
							</span>
						</div>
						<p className="text-[14px] text-muted-foreground mt-0.5 leading-snug break-words whitespace-pre-wrap">{comment.content}</p>
					</div>
					{currentUserId === comment.userId && (
						<button
							type="button"
							onClick={() => deleteCommentMutation.mutate(comment.id)}
							className="shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] -m-2 sm:min-h-0 sm:min-w-0 sm:m-0 sm:p-1.5 rounded text-muted-foreground sm:opacity-0 transition-all hover:text-destructive hover:bg-destructive/10 sm:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring self-start"
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
