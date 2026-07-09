import {
	Books,
	CalendarDots,
	CaretRight,
	CircleNotch,
	Globe,
	Plus,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	type CreateLibraryData,
	CreateLibraryWizard,
} from "@/components/libraries/create-library-wizard";
import { LibraryDetailView } from "@/components/libraries/library-detail-view";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

export function LibrariesSettings() {
	const [showWizard, setShowWizard] = useState(false);
	const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(
		null,
	);

	const { data: libraries, isLoading } = useQuery(
		orpc.libraries.getLibraries.queryOptions(),
	);

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
		<div className="space-y-8">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<p className="text-muted-foreground text-sm">
					{m["library.manage_desc"]()}
				</p>
				{canManageLibraries && (
					<Button
						variant="outline"
						size="sm"
						className="shrink-0 self-start"
						onClick={() => setShowWizard(true)}
					>
						<Plus className="mr-1.5 size-4" />
						{m["library.new"]()}
					</Button>
				)}
			</div>

			{isLoading && (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<CircleNotch className="size-4 animate-spin" />
					{m["library.loading"]()}
				</div>
			)}

			{libraries && libraries.length === 0 && (
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
							<Plus className="mr-1.5 size-4" />
							{m["library.create_first"]()}
						</Button>
					)}
				</EmptyState>
			)}

			{libraries && libraries.length > 0 && (
				<ul className="space-y-2">
					{libraries.map((lib) => {
						const pathCount = lib.paths?.length ?? 0;
						return (
							<li key={lib.id}>
								<button
									type="button"
									onClick={() => setSelectedLibraryId(lib.id)}
									className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-3 text-left transition-colors hover:border-foreground/20 hover:bg-accent/40"
								>
									<Books className="size-5 shrink-0 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-sm">
											{lib.name ?? m["library.untitled"]()}
										</p>
										<p className="text-muted-foreground text-xs">
											{m["library.folder_count"]({ count: pathCount })}
										</p>
									</div>
									{lib.isPublic && (
										<span title={m["library.public"]()}>
											<Globe className="size-3.5 text-muted-foreground" />
										</span>
									)}
									{lib.isCronWatch && (
										<span title={m["library.scheduled_scan"]()}>
											<CalendarDots className="size-3.5 text-muted-foreground" />
										</span>
									)}
									<CaretRight className="size-4 shrink-0 text-muted-foreground" />
								</button>
							</li>
						);
					})}
				</ul>
			)}

			{canManageLibraries && (
				<CreateLibraryWizard
					open={showWizard}
					onOpenChange={setShowWizard}
					onSubmit={(data: CreateLibraryData) => createMutation.mutate(data)}
					isPending={createMutation.isPending}
				/>
			)}
		</div>
	);
}
