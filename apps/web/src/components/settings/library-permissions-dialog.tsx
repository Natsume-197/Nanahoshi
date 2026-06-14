import { PERMISSIONS } from "@nanahoshi-v2/api/auth/permissions.catalog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { orpc } from "@/utils/orpc";

type PermissionMap = Record<string, string[]>;

// The actions worth overriding per library (visibility + content actions).
const OVERRIDABLE: [string, readonly string[]][] = [
	["library", ["view"]],
	["book", PERMISSIONS.book],
	["collection", PERMISSIONS.collection],
	["opds", PERMISSIONS.opds],
];

type TriState = "inherit" | "allow" | "deny";

function stateOf(
	ov: { allow: PermissionMap; deny: PermissionMap },
	r: string,
	a: string,
): TriState {
	if ((ov.deny[r] ?? []).includes(a)) return "deny";
	if ((ov.allow[r] ?? []).includes(a)) return "allow";
	return "inherit";
}

function withState(
	ov: { allow: PermissionMap; deny: PermissionMap },
	r: string,
	a: string,
	next: TriState,
): { allow: PermissionMap; deny: PermissionMap } {
	const strip = (map: PermissionMap) => {
		const set = new Set(map[r] ?? []);
		set.delete(a);
		const out = { ...map };
		if (set.size === 0) delete out[r];
		else out[r] = [...set];
		return out;
	};
	const add = (map: PermissionMap) => {
		const set = new Set(map[r] ?? []);
		set.add(a);
		return { ...map, [r]: [...set] };
	};
	let allow = strip(ov.allow);
	let deny = strip(ov.deny);
	if (next === "allow") allow = add(allow);
	if (next === "deny") deny = add(deny);
	return { allow, deny };
}

export function LibraryPermissionsDialog({
	libraryId,
	open,
	onOpenChange,
}: {
	libraryId: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const qc = useQueryClient();
	const { data: overwrites } = useQuery({
		...orpc.libraryAccess.getOverwrites.queryOptions({ input: { libraryId } }),
		enabled: open,
	});
	const { data: roles } = useQuery({
		...orpc.roles.list.queryOptions(),
		enabled: open,
	});

	const [draft, setDraft] = useState<{
		subjectType: "everyone" | "role" | "user";
		subjectId: string | null;
		allow: PermissionMap;
		deny: PermissionMap;
	} | null>(null);

	const invalidate = () =>
		qc.invalidateQueries({
			queryKey: orpc.libraryAccess.getOverwrites.queryKey({
				input: { libraryId },
			}),
		});

	const upsertMut = useMutation(
		orpc.libraryAccess.upsertOverwrite.mutationOptions({
			onSuccess: () => {
				toast.success("Permissions saved");
				invalidate();
				setDraft(null);
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const deleteMut = useMutation(
		orpc.libraryAccess.deleteOverwrite.mutationOptions({
			onSuccess: () => {
				toast.success("Overwrite removed");
				invalidate();
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const roleName = (id: string | null) =>
		roles?.find((r) => r.id === id)?.name ?? id ?? "everyone";

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Library permissions"
			description="Override what roles can do in this library. Allow beats deny within the role tier; user overrides win over roles."
			className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
		>
			<div className="space-y-4">
				<div className="space-y-3">
					{(overwrites ?? []).map((ov) => (
						<div
							key={ov.id}
							className="flex items-center justify-between rounded-md border p-2 text-sm"
						>
							<span>
								<span className="font-medium capitalize">{ov.subjectType}</span>
								{ov.subjectType === "role" && ` · ${roleName(ov.subjectId)}`}
								{ov.subjectType === "user" && ` · ${ov.subjectId}`}
							</span>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => deleteMut.mutate({ id: ov.id })}
							>
								<Trash2 className="size-4 text-destructive" />
							</Button>
						</div>
					))}
				</div>

				<Separator />

				{draft ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1">
								<Label>Applies to</Label>
								<Select
									value={draft.subjectType}
									onValueChange={(v) =>
										setDraft({
											...draft,
											subjectType: v as "everyone" | "role" | "user",
											subjectId: v === "everyone" ? null : draft.subjectId,
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="everyone">Everyone</SelectItem>
										<SelectItem value="role">Role</SelectItem>
										<SelectItem value="user">User</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{draft.subjectType === "role" && (
								<div className="space-y-1">
									<Label>Role</Label>
									<Select
										value={draft.subjectId ?? ""}
										onValueChange={(v) => setDraft({ ...draft, subjectId: v })}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select role" />
										</SelectTrigger>
										<SelectContent>
											{(roles ?? [])
												.filter((r) => !r.isDefault)
												.map((r) => (
													<SelectItem key={r.id} value={r.id}>
														{r.name}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								</div>
							)}
							{draft.subjectType === "user" && (
								<div className="space-y-1">
									<Label>User ID</Label>
									<input
										className="h-9 w-full rounded-md border px-2 text-sm"
										value={draft.subjectId ?? ""}
										onChange={(e) =>
											setDraft({ ...draft, subjectId: e.target.value })
										}
									/>
								</div>
							)}
						</div>

						<div className="space-y-3">
							{OVERRIDABLE.map(([resource, actions]) => (
								<div key={resource}>
									<p className="mb-1 font-medium text-sm capitalize">
										{resource}
									</p>
									<div className="space-y-1">
										{actions.map((action) => {
											const st = stateOf(draft, resource, action);
											return (
												<div
													key={action}
													className="flex items-center justify-between"
												>
													<span className="text-sm">{action}</span>
													<Select
														value={st}
														onValueChange={(v) =>
															setDraft({
																...draft,
																...withState(
																	draft,
																	resource,
																	action,
																	v as TriState,
																),
															})
														}
													>
														<SelectTrigger className="h-7 w-28">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="inherit">Inherit</SelectItem>
															<SelectItem value="allow">Allow</SelectItem>
															<SelectItem value="deny">Deny</SelectItem>
														</SelectContent>
													</Select>
												</div>
											);
										})}
									</div>
								</div>
							))}
						</div>

						<div className="flex justify-end gap-2">
							<Button variant="ghost" onClick={() => setDraft(null)}>
								Cancel
							</Button>
							<Button
								disabled={
									(draft.subjectType !== "everyone" && !draft.subjectId) ||
									upsertMut.isPending
								}
								onClick={() =>
									upsertMut.mutate({
										libraryId,
										subjectType: draft.subjectType,
										subjectId: draft.subjectId,
										allow: draft.allow,
										deny: draft.deny,
									})
								}
							>
								Save overwrite
							</Button>
						</div>
					</div>
				) : (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							setDraft({
								subjectType: "everyone",
								subjectId: null,
								allow: {},
								deny: {},
							})
						}
					>
						<Plus className="mr-1 size-4" /> Add overwrite
					</Button>
				)}
			</div>
		</Modal>
	);
}
