import { DotsThree, Trash } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import {
	DataTableColumnHeader,
	defineTableFeatures,
} from "@/components/data-table";
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

export type ServersTableMeta = { onSelectOrg?: (orgId: string) => void };

export const serversTableFeatures = defineTableFeatures<ServersTableMeta>();

const helper = createColumnHelper<typeof serversTableFeatures, Server>();

export const serversColumns = helper.columns([
	helper.accessor("name", {
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
	}),
	helper.accessor("slug", {
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Slug" />
		),
		cell: ({ row }) => (
			<span className="font-mono text-muted-foreground">
				{row.original.slug}
			</span>
		),
	}),
	helper.display({
		id: "actions",
		cell: ({ row }) => <OrgActionsCell org={row.original} />,
	}),
]);

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
						<DotsThree />
						<span className="sr-only">Actions</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						variant="destructive"
						onClick={() => deleteMutation.mutate({ orgId: org.id })}
					>
						<Trash />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
