import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { RoleOption } from "@/components/data-table/columns/members-columns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { orpc } from "@/utils/orpc";

export function EditMemberRolesDialog({
	userId,
	currentRoleIds,
	roleOptions,
	open,
	onOpenChange,
}: {
	userId: string;
	currentRoleIds: string[];
	roleOptions: RoleOption[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const qc = useQueryClient();
	const [selected, setSelected] = useState<string[]>(currentRoleIds);

	const assignMut = useMutation(
		orpc.roles.assignMemberRoles.mutationOptions({
			onSuccess: () => {
				toast.success("Roles updated");
				qc.invalidateQueries({
					queryKey: orpc.roles.listAssignments.queryKey(),
				});
				onOpenChange(false);
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const assignable = roleOptions.filter((r) => !r.isDefault);

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Assign roles"
			footer={
				<>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={assignMut.isPending}
						onClick={() => assignMut.mutate({ userId, roleIds: selected })}
					>
						Save
					</Button>
				</>
			}
		>
			<div className="space-y-2">
				{assignable.length === 0 && (
					<p className="text-muted-foreground text-sm">
						No roles to assign yet. Create one in the Roles section.
					</p>
				)}
				{assignable.map((r) => (
					<label
						key={r.id}
						htmlFor={`assign-${r.id}`}
						className="flex items-center gap-2 text-sm"
					>
						<Checkbox
							id={`assign-${r.id}`}
							checked={selected.includes(r.id)}
							onCheckedChange={(checked) =>
								setSelected((prev) =>
									checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
								)
							}
						/>
						{r.name}
					</label>
				))}
			</div>
		</Modal>
	);
}
