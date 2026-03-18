import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getErrorMessage } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

type Organization = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	createdAt: Date;
	metadata: string | null;
};

export type { Organization };

export const organizationsColumns: ColumnDef<Organization, unknown>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Name" />
		),
		cell: ({ row }) => (
			<Link
				to="/dashboard/settings/admin/organizations/$orgId"
				params={{ orgId: row.original.id }}
				className="font-medium hover:underline"
			>
				{row.original.name}
			</Link>
		),
	},
	{
		accessorKey: "slug",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Slug" />
		),
		cell: ({ row }) => (
			<span className="font-mono text-muted-foreground">
				{row.original.slug}
			</span>
		),
	},
	{
		id: "actions",
		cell: ({ row }) => <OrgActionsCell org={row.original} />,
	},
];

function OrgActionsCell({ org }: { org: Organization }) {
	const deleteMutation = useMutation({
		...orpc.admin.deleteOrganization.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.listOrganizations.queryOptions().queryKey,
			});
			toast.success("Organization deleted");
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to delete organization")),
	});

	return (
		<div className="text-right">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={deleteMutation.isPending}
						/>
					}
				>
					<MoreHorizontal />
					<span className="sr-only">Actions</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						variant="destructive"
						onClick={() => deleteMutation.mutate({ orgId: org.id })}
					>
						<Trash2 />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
