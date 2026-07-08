import { useMutation } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
	Prohibit,
	DotsThree,
	Shield,
	ShieldSlash,
	UserCheck,
} from "@phosphor-icons/react";
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

type User = {
	id: string;
	name: string;
	email: string;
	role: string | null;
	banned: boolean | null;
	banReason: string | null;
	createdAt: Date;
};

export const usersColumns: ColumnDef<User, unknown>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Name" />
		),
		cell: ({ row }) => {
			const name = row.original.name;
			return (
				<div className="flex items-center gap-2.5">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
						{name?.charAt(0)?.toUpperCase() ?? "?"}
					</div>
					<span className="font-medium">{name}</span>
				</div>
			);
		},
	},
	{
		accessorKey: "email",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Email" />
		),
		cell: ({ row }) => (
			<span className="text-muted-foreground">{row.original.email}</span>
		),
	},
	{
		accessorKey: "role",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Role" />
		),
		cell: ({ row }) => {
			const role = row.original.role;
			return (
				<Badge variant={role === "admin" ? "default" : "secondary"}>
					{role ?? "user"}
				</Badge>
			);
		},
	},
	{
		id: "status",
		accessorFn: (row) => (row.banned ? "banned" : "active"),
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Status" />
		),
		cell: ({ row }) => {
			const banned = row.original.banned;
			return (
				<Badge variant={banned ? "destructive" : "outline"}>
					{banned ? "Banned" : "Active"}
				</Badge>
			);
		},
	},
	{
		id: "actions",
		cell: ({ row }) => <UserActionsCell user={row.original} />,
	},
];

function UserActionsCell({ user }: { user: User }) {
	const invalidateUsers = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.admin.listUsers.queryOptions().queryKey,
		});
	};

	const banMutation = useMutation({
		...orpc.admin.banUser.mutationOptions(),
		onSuccess: () => {
			invalidateUsers();
			toast.success("User banned");
		},
		onError: (err) => toast.error(getErrorMessage(err, "Failed to ban user")),
	});

	const unbanMutation = useMutation({
		...orpc.admin.unbanUser.mutationOptions(),
		onSuccess: () => {
			invalidateUsers();
			toast.success("User unbanned");
		},
		onError: (err) => toast.error(getErrorMessage(err, "Failed to unban user")),
	});

	const setRoleMutation = useMutation({
		...orpc.admin.setUserRole.mutationOptions(),
		onSuccess: () => {
			invalidateUsers();
			toast.success("User role updated");
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to update role")),
	});

	const isPending =
		banMutation.isPending ||
		unbanMutation.isPending ||
		setRoleMutation.isPending;

	return (
		<div className="text-right">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon-sm" disabled={isPending}>
						<DotsThree />
						<span className="sr-only">Actions</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{user.banned ? (
						<DropdownMenuItem
							onClick={() => unbanMutation.mutate({ userId: user.id })}
						>
							<UserCheck />
							Unban
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							variant="destructive"
							onClick={() => banMutation.mutate({ userId: user.id })}
						>
							<Prohibit />
							Prohibit
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					{user.role === "admin" ? (
						<DropdownMenuItem
							onClick={() =>
								setRoleMutation.mutate({
									userId: user.id,
									role: "user",
								})
							}
						>
							<ShieldSlash />
							Remove Admin
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							onClick={() =>
								setRoleMutation.mutate({
									userId: user.id,
									role: "admin",
								})
							}
						>
							<Shield />
							Make Admin
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
