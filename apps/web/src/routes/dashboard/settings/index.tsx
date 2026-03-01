import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Library, Loader2, Palette, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CreateLibraryForm } from "@/components/create-library-form";
import { LibraryCard } from "@/components/library-card";
import { Button } from "@/components/ui/button";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	const [showCreateForm, setShowCreateForm] = useState(false);

	const { data: libraries, isLoading } = useQuery(
		orpc.libraries.getLibraries.queryOptions(),
	);

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

	const backfillColorsMutation = useMutation({
		mutationFn: () => client.admin.backfillCoverColors(),
		onSuccess: (data) => {
			if (data.enqueued === 0) {
				toast.info("All covers already have colors extracted");
			} else {
				toast.success(
					`Extracting colors for ${data.enqueued} covers in background`,
				);
			}
		},
		onError: () => toast.error("Failed to start color extraction"),
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-2xl tracking-tight">Settings</h1>
					<p className="text-muted-foreground text-sm">
						Manage your libraries and organization settings
					</p>
				</div>
			</div>

			<section className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-lg">Libraries</h2>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowCreateForm(!showCreateForm)}
					>
						<Plus className="mr-1.5 size-4" />
						New Library
					</Button>
				</div>

				{showCreateForm && (
					<CreateLibraryForm
						onSubmit={(data) => createMutation.mutate(data)}
						onCancel={() => setShowCreateForm(false)}
						isPending={createMutation.isPending}
					/>
				)}

				{isLoading && (
					<p className="text-muted-foreground text-sm">Loading libraries...</p>
				)}

				{libraries && libraries.length === 0 && !showCreateForm && (
					<div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
						<Library className="mb-3 size-10 text-muted-foreground/40" />
						<p className="text-muted-foreground text-sm">
							No libraries yet. Create one to get started.
						</p>
					</div>
				)}

				{libraries && libraries.length > 0 && (
					<div className="space-y-3">
						{libraries.map((lib) => (
							<LibraryCard key={lib.id} library={lib} />
						))}
					</div>
				)}
			</section>

			{/* Maintenance */}
			<section className="space-y-4">
				<h2 className="font-semibold text-lg">Maintenance</h2>
				<div className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-4">
					<div className="flex items-center gap-3">
						<div className="flex size-9 items-center justify-center rounded-lg bg-purple-400/10">
							<Palette className="size-4.5 text-purple-400" />
						</div>
						<div>
							<p className="font-medium text-sm">Extract cover colors</p>
							<p className="text-muted-foreground text-xs">
								Analyze book covers to extract their dominant color for UI
								accents
							</p>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => backfillColorsMutation.mutate()}
						disabled={backfillColorsMutation.isPending}
					>
						{backfillColorsMutation.isPending ? (
							<Loader2 className="mr-1.5 size-4 animate-spin" />
						) : (
							<Palette className="mr-1.5 size-4" />
						)}
						Extract
					</Button>
				</div>
			</section>
		</div>
	);
}
