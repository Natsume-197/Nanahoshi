import { PERMISSIONS } from "@nanahoshi-v2/api/auth/permissions.catalog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronRight,
	GripVertical,
	MoreHorizontal,
	Pencil,
	Shield,
	Trash2,
	User,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

type PermissionMap = Record<string, string[]>;
const RESOURCES = Object.entries(PERMISSIONS) as [string, readonly string[]][];

type RoleEdit = {
	id: string | null;
	name: string;
	color: string | null;
	permissions: PermissionMap;
	isDefault: boolean;
};

function hasPerm(
	map: PermissionMap,
	resource: string,
	action: string,
): boolean {
	return (map[resource] ?? []).includes(action);
}

function togglePerm(
	map: PermissionMap,
	resource: string,
	action: string,
): PermissionMap {
	const current = new Set(map[resource] ?? []);
	if (current.has(action)) current.delete(action);
	else current.add(action);
	const next = { ...map };
	if (current.size === 0) delete next[resource];
	else next[resource] = [...current];
	return next;
}

export function RolesSettings() {
	const qc = useQueryClient();
	const { data: org } = authClient.useActiveOrganization();
	const hasOrg = !!org;
	const { can, isOrgOwner, isAppOwner } = useAbilities();

	const canManage = can("roles", "manage") || isOrgOwner || isAppOwner;

	const { data: roles, isLoading } = useQuery({
		...orpc.roles.list.queryOptions(),
		enabled: hasOrg && canManage,
	});

	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState<RoleEdit | null>(null);
	// Local ordering during a drag (highest-first), synced from server data.
	const [dragOrder, setDragOrder] = useState<string[] | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);

	const invalidate = () =>
		qc.invalidateQueries({ queryKey: orpc.roles.list.queryKey() });

	const createMut = useMutation(
		orpc.roles.create.mutationOptions({
			onSuccess: () => {
				toast.success("Role created");
				invalidate();
				setEditing(null);
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const updateMut = useMutation(
		orpc.roles.update.mutationOptions({
			onSuccess: () => {
				toast.success("Role updated");
				invalidate();
				setEditing(null);
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const deleteMut = useMutation(
		orpc.roles.delete.mutationOptions({
			onSuccess: () => {
				toast.success("Role deleted");
				invalidate();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const reorderMut = useMutation(
		orpc.roles.reorder.mutationOptions({
			onSuccess: () => invalidate(),
			onError: (e) => {
				toast.error(e.message);
				invalidate();
			},
		}),
	);

	if (!canManage) {
		return (
			<p className="text-muted-foreground text-sm">
				You don't have permission to manage roles.
			</p>
		);
	}

	const defaultRole = roles?.find((r) => r.isDefault);
	const allCustom = (roles ?? []).filter((r) => !r.isDefault);

	const orderedCustom =
		dragOrder !== null
			? (dragOrder
					.map((id) => allCustom.find((r) => r.id === id))
					.filter(Boolean) as typeof allCustom)
			: allCustom;

	const isSearching = search.trim().length > 0;
	const customRoles = orderedCustom.filter((r) =>
		r.name.toLowerCase().includes(search.toLowerCase()),
	);
	// Dragging is only coherent without a search filter.
	const canReorder = !isSearching && allCustom.length > 1;

	const handleDrop = (targetId: string) => {
		if (!draggingId || draggingId === targetId) return;
		const base = (dragOrder ?? allCustom.map((r) => r.id)).slice();
		const from = base.indexOf(draggingId);
		const to = base.indexOf(targetId);
		if (from === -1 || to === -1) return;
		base.splice(from, 1);
		base.splice(to, 0, draggingId);
		setDragOrder(base);
		reorderMut.mutate({ orderedIds: base });
	};

	const openEdit = (r: NonNullable<typeof roles>[number]) =>
		setEditing({
			id: r.id,
			name: r.name,
			color: r.color,
			permissions: r.permissions as PermissionMap,
			isDefault: r.isDefault,
		});

	const save = () => {
		if (!editing) return;
		if (editing.id) {
			updateMut.mutate({
				id: editing.id,
				name: editing.name,
				color: editing.color,
				permissions: editing.permissions,
			});
		} else {
			createMut.mutate({
				name: editing.name,
				color: editing.color,
				permissions: editing.permissions,
			});
		}
	};

	return (
		<div className="space-y-5">
			<div>
				<p className="text-muted-foreground text-sm">
					Use roles to group your server's members and assign permissions.
				</p>
			</div>

			{/* Default permissions (@everyone) */}
			{defaultRole && (
				<button
					type="button"
					onClick={() => openEdit(defaultRole)}
					className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 text-left transition-colors hover:bg-accent/40"
				>
					<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
						<Shield className="size-4 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-semibold text-sm">Default permissions</p>
						<p className="text-muted-foreground text-xs">
							@everyone · Applies to all members of the server
						</p>
					</div>
					<ChevronRight className="size-5 shrink-0 text-muted-foreground" />
				</button>
			)}

			{/* Search + create */}
			<div className="flex items-center gap-3">
				<Input
					placeholder="Search roles"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="flex-1"
				/>
				<Button
					onClick={() =>
						setEditing({
							id: null,
							name: "",
							color: null,
							permissions: {},
							isDefault: false,
						})
					}
				>
					Create role
				</Button>
			</div>

			<p className="text-muted-foreground text-xs">
				Members use the color of the highest role they hold in this list. Drag
				roles to reorder them.
			</p>

			<Separator />

			{/* List header */}
			<div className="flex items-center justify-between px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
				<span>Roles – {customRoles.length}</span>
				<span className="pr-24">Members</span>
			</div>

			{isLoading ? (
				<div className="space-y-2">
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</div>
			) : customRoles.length === 0 ? (
				<p className="px-1 py-6 text-center text-muted-foreground text-sm">
					No roles yet. Create one to get started.
				</p>
			) : (
				<ul className="divide-y divide-border/60">
					{customRoles.map((r) => (
						<li
							key={r.id}
							draggable={canReorder}
							onDragStart={() => setDraggingId(r.id)}
							onDragEnd={() => setDraggingId(null)}
							onDragOver={(e) => {
								if (canReorder) e.preventDefault();
							}}
							onDrop={(e) => {
								e.preventDefault();
								handleDrop(r.id);
							}}
							className={`flex items-center gap-3 py-3 pr-1 transition-colors hover:bg-accent/20 ${
								draggingId === r.id ? "opacity-50" : ""
							}`}
						>
							{canReorder && (
								<GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
							)}
							<div className="flex min-w-0 flex-1 items-center gap-3">
								<div
									className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted"
									style={
										r.color ? { backgroundColor: `${r.color}22` } : undefined
									}
								>
									<Shield
										className="size-4"
										style={
											r.color
												? { color: r.color }
												: { color: "var(--muted-foreground)" }
										}
									/>
								</div>
								<span className="truncate font-medium text-sm">{r.name}</span>
							</div>

							<div className="flex w-28 items-center gap-1.5 text-muted-foreground text-sm">
								{r.memberCount ?? 0}
								<User className="size-3.5" />
							</div>

							<div className="flex shrink-0 items-center gap-1">
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => openEdit(r)}
									aria-label="Edit role"
								>
									<Pencil className="size-4" />
								</Button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label="More actions"
										>
											<MoreHorizontal className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem onClick={() => openEdit(r)}>
											<Pencil />
											Edit
										</DropdownMenuItem>
										<DropdownMenuItem
											variant="destructive"
											onClick={() => {
												if (confirm(`Delete role "${r.name}"?`))
													deleteMut.mutate({ id: r.id });
											}}
										>
											<Trash2 />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</li>
					))}
				</ul>
			)}

			{/* Create/edit modal */}
			<Modal
				open={!!editing}
				onOpenChange={(open) => !open && setEditing(null)}
				title={
					editing?.isDefault
						? "Default permissions"
						: editing?.id
							? "Edit role"
							: "New role"
				}
				className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
				footer={
					<>
						<Button variant="ghost" onClick={() => setEditing(null)}>
							Cancel
						</Button>
						<Button
							onClick={save}
							disabled={
								!editing?.name || createMut.isPending || updateMut.isPending
							}
						>
							Save
						</Button>
					</>
				}
			>
				{editing && (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1">
								<Label htmlFor="role-name">Name</Label>
								<Input
									id="role-name"
									value={editing.name}
									disabled={editing.isDefault}
									onChange={(e) =>
										setEditing({ ...editing, name: e.target.value })
									}
								/>
							</div>
							{!editing.isDefault && (
								<div className="space-y-1">
									<Label htmlFor="role-color">Color</Label>
									<Input
										id="role-color"
										type="color"
										value={editing.color ?? "#888888"}
										onChange={(e) =>
											setEditing({ ...editing, color: e.target.value })
										}
									/>
								</div>
							)}
						</div>

						<Separator />

						<div className="space-y-4">
							{RESOURCES.map(([resource, actions]) => (
								<div key={resource}>
									<p className="mb-1 font-medium text-sm capitalize">
										{resource}
									</p>
									<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
										{actions.map((action) => {
											const id = `${resource}-${action}`;
											return (
												<label
													key={id}
													htmlFor={id}
													className="flex items-center gap-2 text-sm"
												>
													<Checkbox
														id={id}
														checked={hasPerm(
															editing.permissions,
															resource,
															action,
														)}
														onCheckedChange={() =>
															setEditing({
																...editing,
																permissions: togglePerm(
																	editing.permissions,
																	resource,
																	action,
																),
															})
														}
													/>
													{action}
												</label>
											);
										})}
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}
