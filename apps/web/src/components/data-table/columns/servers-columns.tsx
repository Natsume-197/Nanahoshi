import { useMutation } from "@tanstack/react-query";
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

type Server = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	createdAt: Date;
	metadata: string | null;
};

export type { Server };

declare module "@tanstack/react-table" {
	interface TableMeta<TData> {
		onSelectOrg?: (orgId: string) => void;
		__orgTableData?: TData;
	}
}

export const serversColumns: ColumnDef<Server, unknown>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Name" />
		),
		cell: ({ row, table }) => {
			const onSelectOrg = table.options.meta?.onSelectOrg;
			if (onSelectOrg) {
				return (
					<button
						type="button"
						onClick={() => onSelectOrg(row.original.id)}
						className="font-medium hover:underline"
					>
						{row.original.name}
					</button>
				);
			}
			return <span className="font-medium">{row.original.name}</span>;
		},
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

function OrgActionsCell({ org }: { org: Server }) {
	const deleteMutation = useMutation({
		...orpc.admin.deleteServer.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.listServers.queryOptions().queryKey,
			});
			toast.success("Server deleted");
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to delete server")),
	});

	return (
		<div className="text-right">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={deleteMutation.isPending}
					>
						<MoreHorizontal />
						<span className="sr-only">Actions</span>
					</Button>
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
