import { useMutation } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getErrorMessage } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

type OrgMember = {
	id: string;
	role: string;
	createdAt: Date;
	userId: string;
	userName: string;
	userEmail: string;
};

declare module "@tanstack/react-table" {
	interface TableMeta<TData> {
		orgId?: string;
	}
}

export type { OrgMember };

export const orgMembersColumns: ColumnDef<OrgMember, unknown>[] = [
	{
		id: "member",
		accessorFn: (row) => row.userName,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Member" />
		),
		cell: ({ row }) => {
			const { userName, userEmail } = row.original;
			return (
				<div className="flex items-center gap-2.5">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
						{userName?.charAt(0)?.toUpperCase() ?? "?"}
					</div>
					<div>
						<p className="font-medium text-sm">{userName}</p>
						<p className="text-muted-foreground text-xs">{userEmail}</p>
					</div>
				</div>
			);
		},
	},
	{
		accessorKey: "role",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Role" />
		),
		cell: ({ row }) => {
			const role = row.original.role;
			return (
				<Badge
					variant={
						role === "owner"
							? "default"
							: role === "admin"
								? "secondary"
								: "outline"
					}
				>
					<span className="capitalize">{role}</span>
				</Badge>
			);
		},
	},
	{
		id: "actions",
		cell: ({ row, table }) => (
			<OrgMemberActionsCell
				member={row.original}
				orgId={table.options.meta?.orgId ?? ""}
			/>
		),
	},
];

function OrgMemberActionsCell({
	member,
	orgId,
}: {
	member: OrgMember;
	orgId: string;
}) {
	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.admin.getOrgWithMembers.queryOptions({
				input: { orgId },
			}).queryKey,
		});
	};

	const removeMutation = useMutation({
		...orpc.admin.removeMember.mutationOptions(),
		onSuccess: () => {
			invalidate();
			toast.success("Member removed");
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to remove member")),
	});

	const updateRoleMutation = useMutation({
		...orpc.admin.updateMemberRole.mutationOptions(),
		onSuccess: () => {
			invalidate();
			toast.success("Member role updated");
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to update member role")),
	});

	const isPending = removeMutation.isPending || updateRoleMutation.isPending;

	return (
		<div className="text-right">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="icon-sm" disabled={isPending} />
					}
				>
					<MoreHorizontal />
					<span className="sr-only">Actions</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{member.role !== "owner" && (
						<DropdownMenuItem
							onClick={() =>
								updateRoleMutation.mutate({
									memberId: member.id,
									role: "owner",
								})
							}
						>
							Make Owner
						</DropdownMenuItem>
					)}
					{member.role !== "admin" && (
						<DropdownMenuItem
							onClick={() =>
								updateRoleMutation.mutate({
									memberId: member.id,
									role: "admin",
								})
							}
						>
							Make Admin
						</DropdownMenuItem>
					)}
					{member.role !== "member" && (
						<DropdownMenuItem
							onClick={() =>
								updateRoleMutation.mutate({
									memberId: member.id,
									role: "member",
								})
							}
						>
							Make Member
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => removeMutation.mutate({ memberId: member.id })}
					>
						<UserMinus />
						Remove
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
