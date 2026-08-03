import {
	CircleNotch,
	DotsThree,
	IdentificationCard,
	PencilSimple,
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
import { UserAvatar } from "@/components/shared/user-avatar";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { startImpersonating } from "@/lib/impersonation";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

type User = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: string | null;
	banned: boolean | null;
	banReason: string | null;
	createdAt: Date;
};

export const usersColumns: ColumnDef<User, unknown>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.users.name"]()}
			/>
		),
		cell: ({ row }) => {
			const name = row.original.name;
			return (
				<div className="flex items-center gap-2.5">
					<UserAvatar
						name={name}
						image={row.original.image}
						className="size-7 shrink-0 ring-1 ring-border"
						fallbackClassName="text-xs"
					/>
					<span className="font-medium">{name}</span>
				</div>
			);
		},
	},
	{
		accessorKey: "email",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.users.email"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="text-muted-foreground">{row.original.email}</span>
		),
	},
	{
		accessorKey: "role",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.users.role"]()}
			/>
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
			<DataTableColumnHeader
				column={column}
				title={m["settings.users.status"]()}
			/>
		),
		cell: ({ row }) => {
			const banned = row.original.banned;
			return (
				<Badge variant={banned ? "destructive" : "outline"}>
					{banned ? m["settings.users.banned"]() : m["settings.users.active"]()}
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
	const [editOpen, setEditOpen] = useState(false);
	const [impersonateOpen, setImpersonateOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [name, setName] = useState(user.name);
	const [email, setEmail] = useState(user.email);
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
			toast.success(m["settings.users.ban_success"]());
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.users.ban_failed"]())),
	});

	const unbanMutation = useMutation({
		...orpc.admin.unbanUser.mutationOptions(),
		onSuccess: () => {
			invalidateUsers();
			toast.success(m["settings.users.unban_success"]());
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.users.unban_failed"]())),
	});

	const setRoleMutation = useMutation({
		...orpc.admin.setUserRole.mutationOptions(),
		onSuccess: () => {
			invalidateUsers();
			toast.success(m["settings.users.role_success"]());
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.users.role_failed"]())),
	});

	const editMutation = useMutation({
		mutationFn: async (data: { name: string; email: string }) => {
			const { error } = await authClient.admin.updateUser({
				userId: user.id,
				data,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			setEditOpen(false);
			invalidateUsers();
			toast.success(m["settings.users.edit_success"]());
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.users.edit_failed"]())),
	});

	const impersonateMutation = useMutation({
		mutationFn: () => startImpersonating(user.id),
		onError: (err) =>
			toast.error(
				getErrorMessage(err, m["settings.users.impersonate_failed"]()),
			),
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
		editMutation.isPending ||
		impersonateMutation.isPending ||
		deleteMutation.isPending;

	const openEdit = () => {
		setName(user.name);
		setEmail(user.email);
		setEditOpen(true);
	};

	return (
		<div className="text-right">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={isPending}
						aria-label={m["settings.users.actions"]({ name: user.name })}
					>
						<DotsThree />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={openEdit}>
							<PencilSimple />
							{m["settings.users.edit"]()}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={isCurrentUser}
							title={
								isCurrentUser
									? m["settings.users.impersonate_self"]()
									: undefined
							}
							onClick={() => setImpersonateOpen(true)}
						>
							<IdentificationCard />
							{m["settings.users.impersonate"]()}
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						{user.banned ? (
							<DropdownMenuItem
								onClick={() => unbanMutation.mutate({ userId: user.id })}
							>
								<UserCheck />
								{m["settings.users.unban"]()}
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem
								variant="destructive"
								onClick={() => banMutation.mutate({ userId: user.id })}
							>
								<Prohibit />
								{m["settings.users.ban"]()}
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
								{m["settings.users.remove_admin"]()}
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
								{m["settings.users.make_admin"]()}
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
				open={editOpen}
				onOpenChange={setEditOpen}
				title={m["settings.users.edit_title"]({ name: user.name })}
				description={m["settings.users.edit_description"]()}
				onSubmit={(event) => {
					event.preventDefault();
					editMutation.mutate({ name: name.trim(), email: email.trim() });
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={editMutation.isPending}
							onClick={() => setEditOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button type="submit" disabled={editMutation.isPending}>
							{editMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["common.save"]()}
						</Button>
					</>
				}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={`user-name-${user.id}`}>
							{m["settings.users.name"]()}
						</FieldLabel>
						<Input
							id={`user-name-${user.id}`}
							name="name"
							autoComplete="name"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor={`user-email-${user.id}`}>
							{m["settings.users.email"]()}
						</FieldLabel>
						<Input
							id={`user-email-${user.id}`}
							name="email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</Field>
				</FieldGroup>
			</Modal>

			<Modal
				open={impersonateOpen}
				onOpenChange={setImpersonateOpen}
				title={m["settings.users.impersonate_title"]({ name: user.name })}
				description={m["settings.users.impersonate_description"]({
					email: user.email,
				})}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={impersonateMutation.isPending}
							onClick={() => setImpersonateOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							disabled={impersonateMutation.isPending}
							onClick={() => impersonateMutation.mutate()}
						>
							{impersonateMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["settings.users.impersonate_action"]()}
						</Button>
					</>
				}
			/>

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
