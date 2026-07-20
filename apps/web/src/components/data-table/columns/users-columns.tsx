import {
	CircleNotch,
	DotsThree,
	Prohibit,
	Shield,
	ShieldSlash,
	Trash,
	UserCheck,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/hooks/use-session";
import { m } from "@/paraglide/messages";
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
	const { data: session } = useSession();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const isCurrentUser = session?.user.id === user.id;

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

	const deleteMutation = useMutation({
		...orpc.admin.deleteUser.mutationOptions(),
		onSuccess: () => {
			setDeleteOpen(false);
			invalidateUsers();
			toast.success(m["settings.users.delete_success"]());
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.users.delete_failed"]())),
	});

	const isPending =
		banMutation.isPending ||
		unbanMutation.isPending ||
		setRoleMutation.isPending ||
		deleteMutation.isPending;

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
					<DropdownMenuGroup>
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
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
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
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem
							variant="destructive"
							disabled={isCurrentUser}
							title={
								isCurrentUser ? m["settings.users.delete_self"]() : undefined
							}
							onClick={() => setDeleteOpen(true)}
						>
							<Trash />
							{m["common.delete"]()}
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<Modal
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title={m["settings.users.delete_title"]({ name: user.name })}
				description={m["settings.users.delete_description"]({
					email: user.email,
				})}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={deleteMutation.isPending}
							onClick={() => setDeleteOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={() => deleteMutation.mutate({ userId: user.id })}
						>
							{deleteMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["common.delete"]()}
						</Button>
					</>
				}
			/>
		</div>
	);
}
