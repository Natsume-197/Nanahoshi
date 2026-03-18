import type { ColumnDef } from "@tanstack/react-table";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type Member = {
	id: string;
	organizationId: string;
	userId: string;
	role: string;
	createdAt: Date;
	user: {
		id: string;
		name: string;
		email: string;
	};
};

declare module "@tanstack/react-table" {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface TableMeta<TData> {
		canManage?: boolean;
		onMemberRemoved?: () => void;
	}
}

export const membersColumns: ColumnDef<Member, unknown>[] = [
	{
		id: "member",
		accessorFn: (row) => row.user.name,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Member" />
		),
		cell: ({ row }) => {
			const { user } = row.original;
			return (
				<div className="flex items-center gap-2.5">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
						{user.name?.charAt(0)?.toUpperCase() ?? "?"}
					</div>
					<div>
						<p className="font-medium text-sm">{user.name}</p>
						<p className="text-muted-foreground text-xs">{user.email}</p>
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
		cell: ({ row }) => <span className="capitalize">{row.original.role}</span>,
	},
	{
		id: "actions",
		cell: ({ row, table }) => {
			const { canManage, onMemberRemoved } = table.options.meta ?? {};
			if (!canManage || row.original.role === "owner") return null;
			return (
				<MemberActionsCell
					memberId={row.original.id}
					onRemoved={onMemberRemoved}
				/>
			);
		},
	},
];

function MemberActionsCell({
	memberId,
	onRemoved,
}: {
	memberId: string;
	onRemoved?: () => void;
}) {
	return (
		<div className="text-right">
			<Button
				variant="outline"
				size="icon-sm"
				onClick={async () => {
					try {
						await authClient.organization.removeMember({
							memberIdOrEmail: memberId,
						});
						toast.success("Member removed");
						onRemoved?.();
					} catch {
						toast.error("Failed to remove member");
					}
				}}
			>
				<UserMinus />
			</Button>
		</div>
	);
}
