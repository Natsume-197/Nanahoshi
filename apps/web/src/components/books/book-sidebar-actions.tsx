import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, ListTodo, Loader2, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { client, orpc } from "@/utils/orpc";
import { BookCollectionsPanel } from "./book-collections-panel";

type ReadingStatus = "unread" | "reading" | "completed";

const READING_STATUS_OPTIONS: Array<{
	value: ReadingStatus;
	label: string;
	icon: typeof Check;
}> = [
	{ value: "unread", label: "Unread", icon: ListTodo },
	{ value: "reading", label: "Reading", icon: Timer },
	{ value: "completed", label: "Read", icon: Check },
];

interface BookSidebarActionsProps {
	bookUuid: string;
}

export function BookSidebarActions({ bookUuid }: BookSidebarActionsProps) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const readingProgressQueryOptions =
		orpc.readingProgress.getProgress.queryOptions({
			input: { bookUuid },
		});
	const readingProgressQuery = useQuery({
		...readingProgressQueryOptions,
		staleTime: 60_000,
	});
	const readingStatusMutation = useMutation({
		mutationFn: (status: ReadingStatus) =>
			client.readingProgress.saveProgress({ bookUuid, status }),
		onSuccess: async (result, status) => {
			queryClient.setQueryData(readingProgressQueryOptions.queryKey, result);
			toast.success(
				status === "completed"
					? "Marked as read"
					: status === "reading"
						? "Marked as reading"
						: "Marked as unread",
			);
			await router.invalidate();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update reading status",
			);
		},
	});

	const currentStatus =
		(readingProgressQuery.data?.status as ReadingStatus | undefined) ??
		"unread";

	return (
		<div className="space-y-4">
			<section className="space-y-2">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Reading status
				</h2>
				{readingProgressQuery.isError ? (
					<div className="rounded-md border border-border/70 bg-background/60 p-3">
						<p className="text-muted-foreground text-xs">
							Couldn&apos;t load reading status.
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mt-2"
							onClick={() => {
								void readingProgressQuery.refetch();
							}}
						>
							Retry
						</Button>
					</div>
				) : (
					<div
						className="flex flex-wrap gap-1.5"
						aria-busy={readingStatusMutation.isPending}
					>
						{readingProgressQuery.isLoading && !readingProgressQuery.data ? (
							<span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 text-muted-foreground text-xs">
								<Loader2 className="size-3 animate-spin" />
								Checking status...
							</span>
						) : (
							READING_STATUS_OPTIONS.map((option) => {
								const Icon = option.icon;
								const isActive = currentStatus === option.value;

								return (
									<button
										key={option.value}
										type="button"
										className={cn(
											"inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
											isActive
												? "border-primary/50 bg-primary/10 text-primary"
												: "border-border/80 bg-background/60 text-muted-foreground hover:bg-muted/80 hover:text-foreground",
										)}
										aria-pressed={isActive}
										disabled={readingStatusMutation.isPending || isActive}
										onClick={() => {
											readingStatusMutation.mutate(option.value);
										}}
									>
										<Icon className="size-3" />
										{option.label}
									</button>
								);
							})
						)}
					</div>
				)}
			</section>

			<section className="space-y-2">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Collections
				</h2>
				<BookCollectionsPanel bookUuid={bookUuid} />
			</section>
		</div>
	);
}
