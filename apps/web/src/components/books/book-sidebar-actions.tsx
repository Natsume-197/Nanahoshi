import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	BookmarkPlus,
	BookOpen,
	Check,
	Download,
	Heart,
	ListTodo,
	Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { client, orpc } from "@/utils/orpc";
import { BookCollectionsPanel } from "./book-collections-panel";

const QUICK_SHELF_OPTIONS: Array<{
	value: string;
	label: string;
	icon: typeof Check;
}> = [
	{ value: "read", label: "Leido", icon: Check },
	{ value: "reading", label: "Leyendo", icon: Timer },
	{ value: "backlog", label: "Backlog", icon: ListTodo },
	{ value: "want_to_read", label: "Quiero leer", icon: BookmarkPlus },
];

interface BookSidebarActionsProps {
	bookUuid: string;
}

export function BookSidebarActions({ bookUuid }: BookSidebarActionsProps) {
	const queryClient = useQueryClient();

	const handleDownload = async () => {
		const { url } = await client.files.getSignedDownloadUrl({
			uuid: bookUuid,
		});
		window.open(url, "_blank");
	};

	const likeStatusQueryOptions = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid },
	});
	const likeStatusQuery = useQuery(likeStatusQueryOptions);
	const toggleLikeMutation = useMutation({
		mutationFn: () => client.likedBooks.toggleLike({ bookUuid }),
		onSuccess: (result) => {
			queryClient.setQueryData(likeStatusQueryOptions.queryKey, result);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update like status",
			);
		},
	});
	const isLiked = likeStatusQuery.data?.liked ?? false;

	return (
		<>
			<div className="grid gap-2 pt-1">
				<Link to="/dashboard/books/$uuid/read" params={{ uuid: bookUuid }}>
					<Button className="h-9 w-full gap-2">
						<BookOpen className="size-4" />
						Read
					</Button>
				</Link>
				<Button
					onClick={handleDownload}
					variant="outline"
					className="h-9 w-full gap-2"
				>
					<Download className="size-4" />
					Download
				</Button>
				<Button
					type="button"
					variant="outline"
					aria-pressed={isLiked}
					disabled={toggleLikeMutation.isPending || likeStatusQuery.isLoading}
					onClick={() => toggleLikeMutation.mutate()}
					className={`h-9 w-full gap-2 ${
						isLiked
							? "border-pink-500/60 bg-pink-500/10 text-pink-600 hover:bg-pink-500/20 dark:text-pink-300"
							: ""
					}`}
				>
					<Heart className={`size-4 ${isLiked ? "fill-current" : ""}`} />
					{isLiked ? "Liked" : "Like"}
				</Button>
			</div>

			<section className="space-y-2.5 pt-2">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Estado
				</h2>
				<div className="grid gap-2">
					{QUICK_SHELF_OPTIONS.map((option) => {
						const Icon = option.icon;
						return (
							<Button
								key={option.value}
								type="button"
								size="sm"
								variant="outline"
								className="h-8 justify-start gap-1.5 border-border/80 bg-background/60 hover:bg-muted/80"
							>
								<Icon className="size-3.5" />
								{option.label}
							</Button>
						);
					})}
				</div>
			</section>

			<section className="space-y-2.5 pt-2">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Collections
				</h2>
				<BookCollectionsPanel bookUuid={bookUuid} />
			</section>
		</>
	);
}
