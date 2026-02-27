import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Library, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import CreateLibraryForm from "@/components/create-library-form";
import LibraryCard from "@/components/library-card";
import { Button } from "@/components/ui/button";
import { orpc, queryClient } from "@/utils/orpc";

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
		</div>
	);
}
