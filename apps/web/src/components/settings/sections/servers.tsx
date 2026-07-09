import { Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { serversColumns } from "@/components/data-table/columns/servers-columns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { getErrorMessage } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

export function AdminServers({
	onSelectOrg,
}: {
	/** When provided (settings modal), org rows open detail in-place. */
	onSelectOrg?: (orgId: string) => void;
}) {
	const { data: servers, isLoading } = useQuery(
		orpc.admin.listServers.queryOptions(),
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-muted-foreground text-sm">
						Manage all servers in the system
					</p>
				</div>
				<CreateServerDialog />
			</div>

			<DataTable
				columns={serversColumns}
				data={servers ?? []}
				isLoading={isLoading}
				searchColumn="name"
				searchPlaceholder="Filter by name..."
				emptyState={{ description: "No servers yet." }}
				meta={onSelectOrg ? { onSelectOrg } : undefined}
			/>
		</div>
	);
}

function CreateServerDialog() {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");

	const createMutation = useMutation({
		...orpc.admin.createServer.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.listServers.queryOptions().queryKey,
			});
			setOpen(false);
			setName("");
			setSlug("");
			toast.success("Server created");
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to create server")),
	});

	return (
		<>
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				<Plus data-icon="inline-start" />
				New Server
			</Button>

			<Modal
				open={open}
				onOpenChange={setOpen}
				title="Create Server"
				description="Add a new server to the system."
				className="sm:max-w-md"
				onSubmit={(e) => {
					e.preventDefault();
					createMutation.mutate({ name, slug });
				}}
				footer={
					<>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={createMutation.isPending}>
							Create
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="org-name">Name</Label>
						<Input
							id="org-name"
							placeholder="Server name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="org-slug">Slug</Label>
						<Input
							id="org-slug"
							placeholder="server-slug"
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							required
						/>
					</div>
				</div>
			</Modal>
		</>
	);
}
