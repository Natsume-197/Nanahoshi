import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { organizationsColumns } from "@/components/data-table/columns/organizations-columns";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

export function AdminOrganizations({
	onSelectOrg,
}: {
	/** When provided (settings modal), org rows open detail in-place. */
	onSelectOrg?: (orgId: string) => void;
}) {
	const { data: organizations, isLoading } = useQuery(
		orpc.admin.listOrganizations.queryOptions(),
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-bold text-2xl tracking-tight">Organizations</h2>
					<p className="text-muted-foreground text-sm">
						Manage all organizations in the system
					</p>
				</div>
				<CreateOrganizationDialog />
			</div>

			<DataTable
				columns={organizationsColumns}
				data={organizations ?? []}
				isLoading={isLoading}
				searchColumn="name"
				searchPlaceholder="Filter by name..."
				emptyState={{ description: "No organizations yet." }}
				meta={onSelectOrg ? { onSelectOrg } : undefined}
			/>
		</div>
	);
}

function CreateOrganizationDialog() {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");

	const createMutation = useMutation({
		...orpc.admin.createOrganization.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.listOrganizations.queryOptions().queryKey,
			});
			setOpen(false);
			setName("");
			setSlug("");
			toast.success("Organization created");
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to create organization")),
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Plus data-icon="inline-start" />
					New Organization
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Create Organization</DialogTitle>
					<DialogDescription>
						Add a new organization to the system.
					</DialogDescription>
				</DialogHeader>
				<form
					id="create-org-form"
					onSubmit={(e) => {
						e.preventDefault();
						createMutation.mutate({ name, slug });
					}}
					className="space-y-4 py-2"
				>
					<div className="space-y-1.5">
						<Label htmlFor="org-name">Name</Label>
						<Input
							id="org-name"
							placeholder="Organization name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="org-slug">Slug</Label>
						<Input
							id="org-slug"
							placeholder="organization-slug"
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							required
						/>
					</div>
				</form>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="create-org-form"
						disabled={createMutation.isPending}
					>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
