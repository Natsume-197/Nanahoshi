import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { BookOpen, Check, Clock, Heart, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";
import { BookCollectionsPanel } from "./book-collections-panel";

type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

const SHELF_STATUS_OPTIONS: Array<{
	value: ShelfStatus;
	label: string;
	icon: typeof Check;
}> = [
	{ value: "completed", label: "Completed", icon: Check },
	{ value: "reading", label: "Reading", icon: BookOpen },
	{ value: "backlog", label: "Backlog", icon: Clock },
	{ value: "want_to_read", label: "Want to read", icon: Heart },
];

interface BookSidebarActionsProps {
	bookUuid: string;
}

function useCanEnrich() {
	const { data: session } = authClient.useSession();
	const { data: org } = authClient.useActiveOrganization();

	if (!session) return false;
	if (session.user.role === "admin") return true;

	const myRole = org?.members?.find(
		(m) => m.userId === session.user.id,
	)?.role;
	return myRole === "admin" || myRole === "owner";
}

export function BookSidebarActions({ bookUuid }: BookSidebarActionsProps) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const canEnrich = useCanEnrich();

	const bookShelfQueryOptions = orpc.bookShelf.get.queryOptions({
		input: { bookUuid },
	});
	const bookShelfQuery = useQuery({
		...bookShelfQueryOptions,
		staleTime: 60_000,
	});

	const invalidateShelfQueries = async () => {
		await queryClient.invalidateQueries({
			queryKey: [["bookShelf", "getPublicShelf"]],
		});
	};

	const setShelfMutation = useMutation({
		mutationFn: (status: ShelfStatus) =>
			client.bookShelf.set({ bookUuid, status }),
		onSuccess: async (result) => {
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, result);
			const option = SHELF_STATUS_OPTIONS.find(
				(o) => o.value === result?.status,
			);
			toast.success(option ? `Marked as "${option.label}"` : "List updated");
			await Promise.all([router.invalidate(), invalidateShelfQueries()]);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to update list"));
		},
	});

	const removeShelfMutation = useMutation({
		mutationFn: () => client.bookShelf.remove({ bookUuid }),
		onSuccess: async () => {
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, null);
			toast.success("Removed from list");
			await Promise.all([router.invalidate(), invalidateShelfQueries()]);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to remove from list"));
		},
	});

	const currentStatus = bookShelfQuery.data?.status as ShelfStatus | undefined;
	const isMutating =
		setShelfMutation.isPending || removeShelfMutation.isPending;

	return (
		<div className="space-y-4">
			<section className="space-y-2">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
						Shelf
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
					<div className="flex flex-col gap-1.5" aria-busy={isMutating}>
						{SHELF_STATUS_OPTIONS.map((option) => {
							const Icon = option.icon;
							const isActive = currentStatus === option.value;

							return (
								<button
									key={option.value}
									type="button"
									className={cn(
										"inline-flex min-h-9 w-full items-center justify-start gap-2.5 rounded-md px-3 text-sm ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
										isActive
											? "bg-primary/15 text-primary ring-primary/30"
											: "text-muted-foreground ring-border/50 hover:text-foreground hover:ring-border",
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

			{canEnrich && <EnrichMetadataSection bookUuid={bookUuid} />}
		</div>
	);
}

function EnrichMetadataSection({ bookUuid }: { bookUuid: string }) {
	const queryClient = useQueryClient();
	const router = useRouter();

	const invalidateBook = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.books.getBookWithMetadata.queryOptions({
					input: { uuid: bookUuid },
				}).queryKey,
			}),
			router.invalidate(),
		]);
	};

	const enrichMutation = useMutation({
		mutationFn: () => client.books.enrichFromAmazon({ uuid: bookUuid }),
		onSuccess: async (result) => {
			if (result.success) {
				toast.success("Metadata enriched from Amazon");
				await invalidateBook();
			} else {
				toast.info("No additional metadata found on Amazon");
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to fetch metadata"));
		},
	});

	const restoreMutation = useMutation({
		mutationFn: () =>
			client.books.restoreOriginalMetadata({ uuid: bookUuid }),
		onSuccess: async (result) => {
			if (result.success) {
				toast.success("Metadata restored to original");
				await invalidateBook();
			} else {
				toast.info("No original metadata available");
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to restore metadata"));
		},
	});

	const isBusy = enrichMutation.isPending || restoreMutation.isPending;

	return (
		<section className="space-y-2">
			<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
				Metadata
			</h2>
			<button
				type="button"
				className={cn(
					"inline-flex min-h-9 w-full items-center justify-start gap-2.5 rounded-md px-3 text-sm ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					"text-muted-foreground ring-border/50 hover:text-foreground hover:ring-border",
				)}
				disabled={isBusy}
				onClick={() => enrichMutation.mutate()}
			>
				{enrichMutation.isPending ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<Sparkles className="size-4" />
				)}
				{enrichMutation.isPending ? "Enriching…" : "Enrich from Amazon"}
			</button>
			<button
				type="button"
				className={cn(
					"inline-flex min-h-9 w-full items-center justify-start gap-2.5 rounded-md px-3 text-sm ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					"text-muted-foreground ring-border/50 hover:text-foreground hover:ring-border",
				)}
				disabled={isBusy}
				onClick={() => restoreMutation.mutate()}
			>
				{restoreMutation.isPending ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<RotateCcw className="size-4" />
				)}
				{restoreMutation.isPending ? "Restoring…" : "Restore original"}
			</button>
		</section>
	);
}
