import { BookOpen, CaretRight, Headphones, Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	type CreateLibraryData,
	CreateLibraryWizard,
} from "@/components/libraries/create-library-wizard";
import { LibraryDetailView } from "@/components/libraries/library-detail-view";
import { QueryErrorState } from "@/components/libraries/query-error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

export function LibrariesSettings() {
	const [showWizard, setShowWizard] = useState(false);
	const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(
		null,
	);

	const {
		data: libraries,
		isLoading,
		isError,
		refetch,
	} = useQuery(orpc.libraries.getLibraries.queryOptions());

	const { can } = useAbilities();
	const canManageLibraries = can("library", "create");

	const createMutation = useMutation({
		...orpc.libraries.createLibrary.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
			});
			setShowWizard(false);
			toast.success(m["toast.library_created"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const selected =
		selectedLibraryId !== null
			? libraries?.find((l) => l.id === selectedLibraryId)
			: undefined;

	if (selected) {
		return (
			<LibraryDetailView
				library={selected}
				onBack={() => setSelectedLibraryId(null)}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-7">
			<div className="flex items-start justify-between gap-8">
				<div className="flex min-w-0 flex-col gap-1">
					<p className="text-muted-foreground text-sm">
						{m["library.manage_desc"]()}
					</p>
				</div>
				{canManageLibraries && (
					<Button
						variant="outline"
						size="sm"
						className="shrink-0"
						onClick={() => setShowWizard(true)}
					>
						<Plus data-icon="inline-start" />
						{m["library.new"]()}
					</Button>
				)}
			</div>

			{isError && <QueryErrorState onRetry={() => void refetch()} />}

			{isLoading && !isError && (
				<div className="flex flex-col">
					{["a", "b", "c"].map((key, index) => (
						<div key={key}>
							<div className="flex items-center gap-4 px-3 py-4">
								<Skeleton className="size-11 rounded-xl" />
								<div className="flex flex-1 flex-col gap-2">
									<div className="flex items-center gap-2">
										<Skeleton className="h-5 w-40" />
										<Skeleton className="h-5 w-16 rounded-2xl" />
									</div>
									<Skeleton className="h-4 w-24" />
								</div>
							</div>
							{index < 2 && <Separator className="bg-border/60" />}
						</div>
					))}
				</div>
			)}

			{!isError && libraries && libraries.length === 0 && (
				<EmptyState
					title={m["library.none"]()}
					description={m["library.empty_desc"]()}
				>
					{canManageLibraries && (
						<Button
							variant="outline"
							size="sm"
							className="mt-2"
							onClick={() => setShowWizard(true)}
						>
							<Plus data-icon="inline-start" />
							{m["library.create_first"]()}
						</Button>
					)}
				</EmptyState>
			)}

			{!isError && libraries && libraries.length > 0 && (
				<ul className="flex flex-col">
					{libraries.map((lib, index) => {
						const pathCount = lib.paths?.length ?? 0;
						const Icon = lib.mediaType === "audiobook" ? Headphones : BookOpen;
						const typeLabel =
							lib.mediaType === "audiobook"
								? m["media.audiobook"]()
								: m["media.ebook"]();
						return (
							<li key={lib.id}>
								<button
									type="button"
									onClick={() => setSelectedLibraryId(lib.id)}
									className="group flex w-full items-center gap-4 rounded-xl px-3 py-4 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"
								>
									<div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
										<Icon className="size-5" weight="duotone" />
									</div>
									<div className="flex min-w-0 flex-1 flex-col gap-1.5">
										<div className="flex flex-wrap items-center gap-2">
											<p className="min-w-0 truncate font-medium text-foreground text-sm">
												{lib.name ?? m["library.untitled"]()}
											</p>
											<Badge variant="outline">{typeLabel}</Badge>
											{lib.isPublic && (
												<Badge variant="secondary">
													{m["library.public"]()}
												</Badge>
											)}
											{lib.isCronWatch && (
												<Badge variant="secondary">
													{m["library.scheduled_scan"]()}
												</Badge>
											)}
										</div>
										<p className="text-muted-foreground text-sm">
											{m["library.folder_count"]({ count: pathCount })}
										</p>
									</div>
									<CaretRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
								</button>
								{index < libraries.length - 1 && (
									<Separator className="bg-border/60" />
								)}
							</li>
						);
					})}
				</ul>
			)}

			{canManageLibraries && (
				<CreateLibraryWizard
					key={showWizard ? "open" : "closed"}
					open={showWizard}
					onOpenChange={setShowWizard}
					onSubmit={(data: CreateLibraryData) => createMutation.mutate(data)}
					isPending={createMutation.isPending}
				/>
			)}
		</div>
	);
}
