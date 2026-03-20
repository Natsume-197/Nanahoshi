import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
	BookOpen,
	Check,
	Clock,
	Dices,
	Heart,
	Loader2,
	RotateCcw,
	Sparkles,
} from "lucide-react";
import { useState } from "react";
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

	const myRole = org?.members?.find((m) => m.userId === session.user.id)?.role;
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
		onMutate: async (status) => {
			await queryClient.cancelQueries({
				queryKey: bookShelfQueryOptions.queryKey,
			});
			const previous = queryClient.getQueryData(
				bookShelfQueryOptions.queryKey,
			);
			queryClient.setQueryData(
				bookShelfQueryOptions.queryKey,
				(old: typeof previous) => ({ ...old, status }),
			);
			return { previous };
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, result);
			const option = SHELF_STATUS_OPTIONS.find(
				(o) => o.value === result?.status,
			);
			toast.success(option ? `Marked as "${option.label}"` : "List updated");
			await Promise.all([router.invalidate(), invalidateShelfQueries()]);
		},
		onError: (error, _variables, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(
					bookShelfQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, "Failed to update list"));
		},
	});

	const removeShelfMutation = useMutation({
		mutationFn: () => client.bookShelf.remove({ bookUuid }),
		onMutate: async () => {
			await queryClient.cancelQueries({
				queryKey: bookShelfQueryOptions.queryKey,
			});
			const previous = queryClient.getQueryData(
				bookShelfQueryOptions.queryKey,
			);
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, null);
			return { previous };
		},
		onSuccess: async () => {
			toast.success("Removed from list");
			await Promise.all([router.invalidate(), invalidateShelfQueries()]);
		},
		onError: (error, _variables, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(
					bookShelfQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, "Failed to remove from list"));
		},
	});

	const currentStatus = bookShelfQuery.data?.status as ShelfStatus | undefined;
	const isMutating =
		setShelfMutation.isPending || removeShelfMutation.isPending;

	return (
		<div className="space-y-5 rounded-xl border border-border/40 bg-card/40 p-4">
			<section className="space-y-2.5">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Shelf
				</h2>

				{bookShelfQuery.isError ? (
					<div className="rounded-md border border-border/70 bg-background/60 p-3">
						<p className="text-muted-foreground text-xs">
							Couldn&apos;t load list status.
						</p>
					</div>
				) : (
					<div
						className="grid grid-cols-2 gap-1.5 md:grid-cols-1"
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
										"inline-flex min-h-9 w-full items-center justify-start gap-2 rounded-md px-3 text-sm ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
										isActive
											? "bg-primary/15 text-primary ring-primary/30"
											: "text-muted-foreground ring-border/50 hover:text-foreground hover:ring-border",
									)}
									aria-pressed={isActive}
									disabled={isMutating}
									onClick={() => {
										if (isActive) {
											removeShelfMutation.mutate();
										} else {
											setShelfMutation.mutate(option.value);
										}
									}}
								>
									<Icon className="size-4 shrink-0" />
									{option.label}
								</button>
							);
						})}
					</div>
				)}
			</section>

			<section className="space-y-2.5">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Collections
				</h2>
				<BookCollectionsPanel bookUuid={bookUuid} />
			</section>

			{canEnrich && <EnrichMetadataSection bookUuid={bookUuid} />}

			<RandomBookSection />
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
		mutationFn: () => client.books.restoreOriginalMetadata({ uuid: bookUuid }),
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
		<section className="space-y-2.5">
			<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
				Metadata
			</h2>
			<div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
				<button
					type="button"
					className={cn(
						"inline-flex min-h-9 w-full items-center justify-start gap-2 rounded-md px-3 text-sm ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
						"text-muted-foreground ring-border/50 hover:text-foreground hover:ring-border",
					)}
					disabled={isBusy}
					onClick={() => enrichMutation.mutate()}
				>
					{enrichMutation.isPending ? (
						<Loader2 className="size-4 shrink-0 animate-spin" />
					) : (
						<Sparkles className="size-4 shrink-0" />
					)}
					{enrichMutation.isPending ? "Enriching…" : "Enrich"}
				</button>
				<button
					type="button"
					className={cn(
						"inline-flex min-h-9 w-full items-center justify-start gap-2 rounded-md px-3 text-sm ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
						"text-muted-foreground ring-border/50 hover:text-foreground hover:ring-border",
					)}
					disabled={isBusy}
					onClick={() => restoreMutation.mutate()}
				>
					{restoreMutation.isPending ? (
						<Loader2 className="size-4 shrink-0 animate-spin" />
					) : (
						<RotateCcw className="size-4 shrink-0" />
					)}
					{restoreMutation.isPending ? "Restoring…" : "Restore"}
				</button>
			</div>
		</section>
	);
}

function RandomBookSection() {
	const navigate = useNavigate();
	const [isLoading, setIsLoading] = useState(false);

	const handleClick = () => {
		if (isLoading) return;
		setIsLoading(true);
		client.books
			.listRandom({ limit: 1 })
			.then((books) => {
				const book = books?.[0];
				if (book) {
					navigate({
						to: "/dashboard/books/$uuid",
						params: { uuid: book.uuid },
					});
				}
			})
			.finally(() => setIsLoading(false));
	};

	return (
		<section className="space-y-2.5">
			<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
				Discover
			</h2>
			<button
				type="button"
				className={cn(
					"inline-flex min-h-9 w-full items-center justify-start gap-2 rounded-md px-3 text-sm ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					"text-muted-foreground ring-border/50 hover:text-foreground hover:ring-border",
					"md:w-full",
				)}
				disabled={isLoading}
				onClick={handleClick}
			>
				<Dices
					className={cn("size-4 shrink-0", isLoading && "animate-spin")}
				/>
				Random book
			</button>
		</section>
	);
}
