import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	BookMarked,
	BookOpen,
	Check,
	Clock,
	Heart,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { client, orpc } from "@/utils/orpc";
import { BookCollectionsPanel } from "./book-collections-panel";

type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

const SHELF_STATUS_OPTIONS: Array<{
	value: ShelfStatus;
	label: string;
	icon: typeof Check;
}> = [
	{ value: "want_to_read", label: "Want to read", icon: Heart },
	{ value: "backlog", label: "Backlog", icon: Clock },
	{ value: "reading", label: "Reading", icon: BookOpen },
	{ value: "completed", label: "Completed", icon: Check },
];

interface BookSidebarActionsProps {
	bookUuid: string;
}

export function BookSidebarActions({ bookUuid }: BookSidebarActionsProps) {
	const queryClient = useQueryClient();
	const router = useRouter();

	const bookShelfQueryOptions = orpc.bookShelf.get.queryOptions({
		input: { bookUuid },
	});
	const bookShelfQuery = useQuery({
		...bookShelfQueryOptions,
		staleTime: 60_000,
	});

	const setShelfMutation = useMutation({
		mutationFn: (status: ShelfStatus) =>
			client.bookShelf.set({ bookUuid, status }),
		onSuccess: async (result) => {
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, result);
			const option = SHELF_STATUS_OPTIONS.find((o) => o.value === result?.status);
			toast.success(option ? `Marked as "${option.label}"` : "List updated");
			await router.invalidate();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update list",
			);
		},
	});

	const removeShelfMutation = useMutation({
		mutationFn: () => client.bookShelf.remove({ bookUuid }),
		onSuccess: async () => {
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, null);
			toast.success("Removed from list");
			await router.invalidate();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove from list",
			);
		},
	});

	const currentStatus = bookShelfQuery.data?.status as ShelfStatus | undefined;
	const isMutating = setShelfMutation.isPending || removeShelfMutation.isPending;

	return (
		<div className="space-y-4">
			<section className="space-y-2">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
						My List
					</h2>
					{currentStatus && (
						<button
							type="button"
							className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground"
							disabled={isMutating}
							onClick={() => removeShelfMutation.mutate()}
						>
							<X className="size-3" />
							Remove
						</button>
					)}
				</div>

				{bookShelfQuery.isError ? (
					<div className="rounded-md border border-border/70 bg-background/60 p-3">
						<p className="text-muted-foreground text-xs">
							Couldn&apos;t load list status.
						</p>
					</div>
				) : (
					<div
						className="flex flex-col gap-1.5"
						aria-busy={isMutating}
					>
						{SHELF_STATUS_OPTIONS.map((option) => {
							const Icon = option.icon;
							const isActive = currentStatus === option.value;

							return (
								<button
									key={option.value}
									type="button"
									className={cn(
										"inline-flex min-h-9 w-full items-center justify-start gap-2.5 rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
										isActive
											? "border-primary/50 bg-primary/10 text-primary"
											: "border-border/80 bg-background/60 text-muted-foreground hover:bg-muted/80 hover:text-foreground",
									)}
									aria-pressed={isActive}
									disabled={isMutating || isActive}
									onClick={() => {
										setShelfMutation.mutate(option.value);
									}}
								>
									<Icon className="size-4" />
									{option.label}
								</button>
							);
						})}
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
