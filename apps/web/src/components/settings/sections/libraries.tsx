import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Lock, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CreateLibraryForm } from "@/components/libraries/create-library-form";
import { LibraryCard } from "@/components/libraries/library-card";
import { LibraryPermissionsDialog } from "@/components/settings/library-permissions-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { orpc, queryClient } from "@/utils/orpc";

export function LibrariesSettings() {
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [permsLibraryId, setPermsLibraryId] = useState<number | null>(null);

	const { data: libraries, isLoading } = useQuery(
		orpc.libraries.getLibraries.queryOptions(),
	);

	const { can } = useAbilities();

	const canManageLibraries = can("library", "create");
	const canManageAccess = can("library", "manageAccess");

	const createMutation = useMutation({
		...orpc.libraries.createLibrary.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
			});
			setShowCreateForm(false);
			toast.success("Library created");
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Libraries</h2>
				<p className="text-muted-foreground text-sm">
					Manage your book libraries and scan paths
				</p>
			</div>

			<section className="space-y-4">
				{canManageLibraries && (
					<div className="flex items-center justify-end">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowCreateForm(!showCreateForm)}
						>
							<Plus className="mr-1.5 size-4" />
							New Library
						</Button>
					</div>
				)}

				{showCreateForm && canManageLibraries && (
					<CreateLibraryForm
						onSubmit={(data) => createMutation.mutate(data)}
						onCancel={() => setShowCreateForm(false)}
						isPending={createMutation.isPending}
					/>
				)}

				{isLoading && (
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<Loader2 className="size-4 animate-spin" />
						Loading libraries...
					</div>
				)}

				{libraries && libraries.length === 0 && !showCreateForm && (
					<EmptyState
						title="No libraries yet"
						description="A library points to a folder on your server where your ebooks are stored. Nanahoshi will scan it and import your books automatically."
					>
						{canManageLibraries && (
							<Button
								variant="outline"
								size="sm"
								className="mt-2"
								onClick={() => setShowCreateForm(true)}
							>
								<Plus className="mr-1.5 size-4" />
								Create your first library
							</Button>
						)}
					</EmptyState>
				)}

				{libraries && libraries.length > 0 && (
					<div className="space-y-3">
						{libraries.map((lib) => (
							<div key={lib.id} className="space-y-2">
								<LibraryCard library={lib} canManage={canManageLibraries} />
								{canManageAccess && (
									<div className="flex justify-end">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setPermsLibraryId(lib.id)}
										>
											<Lock className="mr-1.5 size-3.5" />
											Permissions
										</Button>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</section>

			{permsLibraryId !== null && (
				<LibraryPermissionsDialog
					libraryId={permsLibraryId}
					open={permsLibraryId !== null}
					onOpenChange={(open) => !open && setPermsLibraryId(null)}
				/>
			)}
		</div>
	);
}
