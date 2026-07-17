import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { membersColumns } from "@/components/data-table/columns/members-columns";
import { EditMemberRolesDialog } from "@/components/settings/edit-member-roles-dialog";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export function MembersSettings() {
	const qc = useQueryClient();
	const { data: org, isPending: isLoading } =
		authClient.useActiveOrganization();

	const { can, isOrgOwner, isAppOwner } = useAbilities();
	const canManage = can("member", "remove") || can("member", "invite");
	const canAssignRoles = can("member", "assignRoles");

	const [editingRolesFor, setEditingRolesFor] = useState<string | null>(null);

	const { data: roleList } = useQuery({
		...orpc.roles.list.queryOptions(),
		enabled: canAssignRoles,
	});
	const { data: assignments } = useQuery({
		...orpc.roles.listAssignments.queryOptions(),
		enabled: canAssignRoles,
	});

	const transferMut = useMutation(
		orpc.members.transferOwnership.mutationOptions({
			onSuccess: () => {
				toast.success(m["settings.members.ownership_transferred"]());
				qc.invalidateQueries();
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const roleOptions = (roleList ?? []).map((r) => ({
		id: r.id,
		name: r.name,
		isDefault: r.isDefault,
	}));

	return (
		<div className="flex flex-col gap-6">
			<div>
				<p className="text-muted-foreground text-sm">
					{m["settings.members.desc"]()}
				</p>
			</div>

			{!isLoading && !org && (
				<p className="text-muted-foreground text-sm">
					{m["settings.org.none_selected"]()}
				</p>
			)}

			<DataTable
				variant="plain"
				columns={membersColumns}
				data={org?.members ?? []}
				isLoading={isLoading}
				emptyState={{ description: m["settings.members.empty"]() }}
				meta={{
					canManage: !!canManage,
					onMemberRemoved: () => qc.invalidateQueries(),
					roleOptions,
					assignments: assignments ?? {},
					canAssignRoles,
					canTransferOwnership: isOrgOwner || isAppOwner,
					onEditRoles: (userId) => setEditingRolesFor(userId),
					onTransferOwnership: (userId) => {
						if (confirm(m["settings.members.transfer_confirm"]()))
							transferMut.mutate({ targetUserId: userId });
					},
				}}
			/>

			{editingRolesFor && (
				<EditMemberRolesDialog
					userId={editingRolesFor}
					currentRoleIds={assignments?.[editingRolesFor] ?? []}
					roleOptions={roleOptions}
					open={!!editingRolesFor}
					onOpenChange={(open) => !open && setEditingRolesFor(null)}
				/>
			)}
		</div>
	);
}
