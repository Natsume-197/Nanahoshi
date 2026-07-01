import { isOwnerRole } from "@nanahoshi-v2/api/auth/access.service";
import type { ColumnDef } from "@tanstack/react-table";
import { Crown, MoreHorizontal, Shield, UserMinus } from "lucide-react";
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
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";

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

export type RoleOption = { id: string; name: string; isDefault: boolean };

declare module "@tanstack/react-table" {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface TableMeta<TData> {
		canManage?: boolean;
		onMemberRemoved?: () => void;
		roleOptions?: RoleOption[];
		assignments?: Record<string, string[]>;
		canAssignRoles?: boolean;
		canTransferOwnership?: boolean;
		onEditRoles?: (userId: string) => void;
		onTransferOwnership?: (userId: string) => void;
	}
}

export const membersColumns: ColumnDef<Member, unknown>[] = [
	{
		id: "member",
		accessorFn: (row) => row.user.name,
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.members.member"]()}
			/>
		),
		cell: ({ row }) => {
			const { user, role } = row.original;
			return (
				<div className="flex items-center gap-2.5">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
						{user.name?.charAt(0)?.toUpperCase() ?? "?"}
					</div>
					<div>
						<p className="flex items-center gap-1 font-medium text-sm">
							{user.name}
							{isOwnerRole(role) && (
								<Crown className="size-3.5 text-amber-500" />
							)}
						</p>
						<p className="text-muted-foreground text-xs">{user.email}</p>
					</div>
				</div>
			);
		},
	},
	{
		id: "roles",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.members.roles"]()}
			/>
		),
		cell: ({ row, table }) => {
			const { roleOptions, assignments } = table.options.meta ?? {};
			const ids = assignments?.[row.original.userId] ?? [];
			const byId = new Map((roleOptions ?? []).map((r) => [r.id, r]));
			if (isOwnerRole(row.original.role)) {
				return <Badge variant="default">{m["settings.members.owner"]()}</Badge>;
			}
			if (ids.length === 0) {
				return (
					<span className="text-muted-foreground text-xs">
						{m["settings.members.member"]()}
					</span>
				);
			}
			return (
				<div className="flex flex-wrap gap-1">
					{ids.map((id) => (
						<Badge key={id} variant="secondary">
							{byId.get(id)?.name ?? id}
						</Badge>
					))}
				</div>
			);
		},
	},
	{
		id: "actions",
		cell: ({ row, table }) => {
			const meta = table.options.meta ?? {};
			return <MemberActionsCell member={row.original} meta={meta} />;
		},
	},
];

function MemberActionsCell({
	member,
	meta,
}: {
	member: Member;
	meta: NonNullable<import("@tanstack/react-table").TableMeta<Member>>;
}) {
	const owner = isOwnerRole(member.role);
	const canRemove = meta.canManage && !owner;
	const canEditRoles = meta.canAssignRoles && !owner;
	const canMakeOwner = meta.canTransferOwnership && !owner;

	if (!canRemove && !canEditRoles && !canMakeOwner) return null;

	return (
		<div className="text-right">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon-sm">
						<MoreHorizontal />
						<span className="sr-only">{m["settings.members.actions"]()}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{canEditRoles && (
						<DropdownMenuItem onClick={() => meta.onEditRoles?.(member.userId)}>
							<Shield />
							{m["settings.members.manage_roles"]()}
						</DropdownMenuItem>
					)}
					{canMakeOwner && (
						<DropdownMenuItem
							onClick={() => meta.onTransferOwnership?.(member.userId)}
						>
							<Crown />
							{m["settings.members.make_owner"]()}
						</DropdownMenuItem>
					)}
					{(canEditRoles || canMakeOwner) && canRemove && (
						<DropdownMenuSeparator />
					)}
					{canRemove && (
						<DropdownMenuItem
							variant="destructive"
							onClick={async () => {
								try {
									await client.members.remove({
										targetUserId: member.userId,
									});
									toast.success(m["settings.members.removed"]());
									meta.onMemberRemoved?.();
								} catch (e) {
									toast.error(
										e instanceof Error
											? e.message
											: m["settings.members.remove_failed"](),
									);
								}
							}}
						>
							<UserMinus />
							{m["settings.members.remove"]()}
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
