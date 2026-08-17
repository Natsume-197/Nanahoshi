import { isOwnerRole } from "@nanahoshi-v2/api/auth/access.service";
import { Crown, DotsThree, Shield, UserMinus } from "@phosphor-icons/react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import {
	DataTableColumnHeader,
	defineTableFeatures,
} from "@/components/data-table";
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
		image?: string | null;
	};
};

export type RoleOption = { id: string; name: string; isDefault: boolean };

export type MembersTableMeta = {
	canManage?: boolean;
	onMemberRemoved?: () => void;
	roleOptions?: RoleOption[];
	assignments?: Record<string, string[]>;
	canAssignRoles?: boolean;
	canTransferOwnership?: boolean;
	onEditRoles?: (userId: string) => void;
	onTransferOwnership?: (userId: string) => void;
};

export const membersTableFeatures = defineTableFeatures<MembersTableMeta>();

const helper = createColumnHelper<typeof membersTableFeatures, Member>();

export const membersColumns = helper.columns([
	helper.accessor((row) => row.user.name, {
		id: "member",
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
					<UserAvatar
						name={user.name}
						image={user.image}
						className="size-7 shrink-0"
						fallbackClassName="text-xs"
					/>
					<div>
						<p className="flex items-center gap-1 font-medium text-sm">
							{user.name}
							{isOwnerRole(role) && <Crown className="size-3.5 text-warning" />}
						</p>
						<p className="text-muted-foreground text-xs">{user.email}</p>
					</div>
				</div>
			);
		},
	}),
	helper.display({
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
	}),
	helper.display({
		id: "actions",
		cell: ({ row, table }) => {
			const meta = table.options.meta ?? {};
			return <MemberActionsCell member={row.original} meta={meta} />;
		},
	}),
]);

function MemberActionsCell({
	member,
	meta,
}: {
	member: Member;
	meta: MembersTableMeta;
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
						<DotsThree />
						<span className="sr-only">{m["settings.members.actions"]()}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						{canEditRoles && (
							<DropdownMenuItem
								onClick={() => meta.onEditRoles?.(member.userId)}
							>
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
					</DropdownMenuGroup>
					{(canEditRoles || canMakeOwner) && canRemove && (
						<DropdownMenuSeparator />
					)}
					<DropdownMenuGroup>
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
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
