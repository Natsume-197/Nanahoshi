import { PERMISSIONS } from "@nanahoshi-v2/api/auth/permissions.catalog";
import {
	ArrowLeft,
	Check,
	CircleNotch,
	Minus,
	Plus,
	Shield,
	Trash,
	User,
	UsersThree,
	X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { permissionMapsEqual } from "./library-ui-state";
import { QueryErrorState } from "./query-error-state";

type PermissionMap = Record<string, string[]>;
type SubjectType = "everyone" | "role" | "user";
type TriState = "inherit" | "allow" | "deny";

type PermissionDraft = {
	id: number | null;
	subjectType: SubjectType;
	subjectId: string | null;
	allow: PermissionMap;
	deny: PermissionMap;
};

type PendingSelection =
	| { kind: "existing"; id: number }
	| { kind: "new"; subjectType: SubjectType; subjectId: string | null }
	| { kind: "clear" }
	| null;

const OVERRIDABLE: [string, readonly string[]][] = [
	["library", ["view"]],
	["book", PERMISSIONS.book],
	["audiobook", PERMISSIONS.audiobook],
	["collection", PERMISSIONS.collection],
	["opds", PERMISSIONS.opds],
];

const RESOURCE_LABELS: Record<string, () => string> = {
	library: m["library.access_resource_library"],
	book: m["library.access_resource_books"],
	audiobook: m["library.access_resource_audiobooks"],
	collection: m["library.access_resource_collections"],
	opds: m["library.access_resource_opds"],
};

const ACTION_LABELS: Record<string, () => string> = {
	view: m["library.access_action_view"],
	read: m["library.access_action_read"],
	download: m["library.access_action_download"],
	editMetadata: m["library.access_action_edit_metadata"],
	delete: m["library.access_action_delete"],
	bulkEdit: m["library.access_action_bulk_edit"],
	create: m["library.access_action_create"],
	update: m["library.access_action_update"],
	makePublic: m["library.access_action_make_public"],
	access: m["library.access_action_opds"],
};

function stateOf(
	overwrite: { allow: PermissionMap; deny: PermissionMap },
	resource: string,
	action: string,
): TriState {
	if ((overwrite.deny[resource] ?? []).includes(action)) return "deny";
	if ((overwrite.allow[resource] ?? []).includes(action)) return "allow";
	return "inherit";
}

function withState(
	overwrite: { allow: PermissionMap; deny: PermissionMap },
	resource: string,
	action: string,
	next: TriState,
): { allow: PermissionMap; deny: PermissionMap } {
	const strip = (map: PermissionMap) => {
		const set = new Set(map[resource] ?? []);
		set.delete(action);
		const output = { ...map };
		if (set.size === 0) delete output[resource];
		else output[resource] = [...set];
		return output;
	};
	const add = (map: PermissionMap) => {
		const set = new Set(map[resource] ?? []);
		set.add(action);
		return { ...map, [resource]: [...set] };
	};

	let allow = strip(overwrite.allow);
	let deny = strip(overwrite.deny);
	if (next === "allow") allow = add(allow);
	if (next === "deny") deny = add(deny);
	return { allow, deny };
}

function subjectKey(subject: {
	subjectType: SubjectType;
	subjectId: string | null;
}) {
	return `${subject.subjectType}:${subject.subjectId ?? "everyone"}`;
}

export function LibraryPermissionsPanel({
	libraryId,
	enabled = true,
	onDirtyChange,
}: {
	libraryId: number;
	enabled?: boolean;
	onDirtyChange?: (dirty: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const { data: org } = authClient.useActiveOrganization();
	const {
		data: overwrites,
		isLoading: overwritesLoading,
		isError: overwritesError,
		refetch: refetchOverwrites,
	} = useQuery({
		...orpc.libraryAccess.getOverwrites.queryOptions({ input: { libraryId } }),
		enabled,
	});
	const {
		data: roles,
		isLoading: rolesLoading,
		isError: rolesError,
		refetch: refetchRoles,
	} = useQuery({
		...orpc.roles.list.queryOptions(),
		enabled,
	});

	const [draft, setDraft] = useState<PermissionDraft | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [removeOpen, setRemoveOpen] = useState(false);
	const [discardOpen, setDiscardOpen] = useState(false);
	const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
	const [pendingSelection, setPendingSelection] =
		useState<PendingSelection>(null);
	const initialized = useRef(false);

	useEffect(() => {
		if (initialized.current || overwrites === undefined) return;
		initialized.current = true;
		const first = overwrites[0];
		if (first) {
			setDraft({
				id: first.id,
				subjectType: first.subjectType,
				subjectId: first.subjectId,
				allow: first.allow,
				deny: first.deny,
			});
		}
	}, [overwrites]);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.libraryAccess.getOverwrites.queryKey({
				input: { libraryId },
			}),
		});

	const upsertMutation = useMutation(
		orpc.libraryAccess.upsertOverwrite.mutationOptions({
			onSuccess: async (_result, variables) => {
				toast.success(m["library.access_saved"]());
				const refreshed = await queryClient.fetchQuery({
					...orpc.libraryAccess.getOverwrites.queryOptions({
						input: { libraryId },
					}),
					staleTime: 0,
				});
				const saved = refreshed.find(
					(overwrite) =>
						overwrite.subjectType === variables.subjectType &&
						overwrite.subjectId === variables.subjectId,
				);
				if (saved) selectOverwrite(saved);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const deleteMutation = useMutation(
		orpc.libraryAccess.deleteOverwrite.mutationOptions({
			onSuccess: async () => {
				toast.success(m["library.access_removed"]());
				setRemoveOpen(false);
				setMobileEditorOpen(false);
				setDraft(null);
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const roleName = (id: string | null) =>
		roles?.find((role) => role.id === id)?.name ?? id ?? "";
	const memberName = (id: string | null) => {
		const member = org?.members?.find((item) => item.userId === id);
		return member?.user?.name || member?.user?.email || id || "";
	};
	const subjectName = (subject: {
		subjectType: SubjectType;
		subjectId: string | null;
	}) => {
		if (subject.subjectType === "everyone") return "@everyone";
		if (subject.subjectType === "role") return roleName(subject.subjectId);
		return memberName(subject.subjectId);
	};

	const selectOverwrite = (overwrite: NonNullable<typeof overwrites>[number]) =>
		setDraft({
			id: overwrite.id,
			subjectType: overwrite.subjectType,
			subjectId: overwrite.subjectId,
			allow: overwrite.allow,
			deny: overwrite.deny,
		});

	const applyNewSubject = (
		subjectType: SubjectType,
		subjectId: string | null,
	) => {
		setDraft({
			id: null,
			subjectType,
			subjectId,
			allow: {},
			deny: {},
		});
		setAddOpen(false);
	};

	const existingKeys = new Set((overwrites ?? []).map(subjectKey));
	const availableRoles = (roles ?? []).filter(
		(role) =>
			!role.isDefault &&
			!existingKeys.has(
				subjectKey({ subjectType: "role", subjectId: role.id }),
			),
	);
	const availableMembers = (org?.members ?? []).filter(
		(member) =>
			!existingKeys.has(
				subjectKey({ subjectType: "user", subjectId: member.userId }),
			),
	);
	const everyoneAvailable = !existingKeys.has(
		subjectKey({ subjectType: "everyone", subjectId: null }),
	);

	const original = draft?.id
		? overwrites?.find((overwrite) => overwrite.id === draft.id)
		: undefined;
	const changed = draft
		? original
			? !permissionMapsEqual(draft.allow, original.allow) ||
				!permissionMapsEqual(draft.deny, original.deny)
			: Object.keys(draft.allow).length > 0 ||
				Object.keys(draft.deny).length > 0
		: false;
	const selectedKey = draft ? subjectKey(draft) : null;

	useEffect(() => {
		onDirtyChange?.(changed);
		return () => onDirtyChange?.(false);
	}, [changed, onDirtyChange]);

	const applySelection = (selection: NonNullable<PendingSelection>) => {
		if (selection.kind === "clear") {
			setDraft(null);
			setMobileEditorOpen(false);
		} else if (selection.kind === "new") {
			applyNewSubject(selection.subjectType, selection.subjectId);
			setMobileEditorOpen(true);
		} else {
			const overwrite = overwrites?.find((item) => item.id === selection.id);
			if (overwrite) selectOverwrite(overwrite);
			setMobileEditorOpen(true);
		}
	};

	const applyPendingSelection = () => {
		if (!pendingSelection) return;
		applySelection(pendingSelection);
		setPendingSelection(null);
		setDiscardOpen(false);
	};

	const requestSelection = (selection: NonNullable<PendingSelection>) => {
		if (selection.kind === "new") setAddOpen(false);
		if (changed) {
			setPendingSelection(selection);
			setDiscardOpen(true);
			return;
		}
		applySelection(selection);
	};

	if (overwritesLoading || rolesLoading) {
		return <Skeleton className="h-[520px] w-full rounded-xl" />;
	}

	if (overwritesError || rolesError) {
		return (
			<QueryErrorState
				onRetry={() => {
					void Promise.all([refetchOverwrites(), refetchRoles()]);
				}}
			/>
		);
	}

	return (
		<>
			<div className="flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-border md:min-h-[520px] md:flex-row">
				<aside
					className={cn(
						"shrink-0 flex-col border-border bg-muted/30 p-3 md:flex md:w-56 md:border-r",
						mobileEditorOpen ? "hidden" : "flex",
					)}
				>
					<div className="flex items-center justify-between gap-3 px-2 pb-2">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							{m["library.access_subjects"]()}
						</p>
						<Button
							variant="ghost"
							size="icon"
							className="size-11 md:size-8"
							onClick={() => setAddOpen(true)}
							aria-label={m["library.access_add_subject"]()}
						>
							<Plus />
						</Button>
					</div>

					{(overwrites?.length ?? 0) === 0 && !draft ? (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 px-3 py-8 text-center">
							<UsersThree className="size-8 text-muted-foreground" />
							<p className="text-muted-foreground text-sm">
								{m["library.access_no_subjects"]()}
							</p>
						</div>
					) : (
						<div className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto md:max-h-none">
							{draft?.id === null && (
								<SubjectButton
									active
									type={draft.subjectType}
									name={subjectName(draft)}
									onClick={() => undefined}
								/>
							)}
							{overwrites?.map((overwrite) => (
								<SubjectButton
									key={overwrite.id}
									active={selectedKey === subjectKey(overwrite)}
									type={overwrite.subjectType}
									name={subjectName(overwrite)}
									onClick={() =>
										requestSelection({ kind: "existing", id: overwrite.id })
									}
								/>
							))}
						</div>
					)}
				</aside>

				<section
					className={cn(
						"min-w-0 flex-1 p-5 sm:p-6 md:block",
						mobileEditorOpen ? "block" : "hidden",
					)}
				>
					{draft ? (
						<div className="flex flex-col gap-6">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="self-start md:hidden"
								onClick={() => requestSelection({ kind: "clear" })}
							>
								<ArrowLeft data-icon="inline-start" />
								{m["library.access_subjects"]()}
							</Button>
							<div className="flex items-start justify-between gap-6">
								<div className="min-w-0">
									<p className="text-muted-foreground text-xs uppercase tracking-wide">
										{m["library.access_permissions_for"]()}
									</p>
									<h3 className="truncate font-semibold text-foreground text-lg">
										{subjectName(draft)}
									</h3>
									<p className="mt-1 max-w-xl text-muted-foreground text-sm">
										{m["library.access_inherit_hint"]()}
									</p>
								</div>
								{draft.id !== null && (
									<Button
										variant="ghost"
										size="icon-sm"
										className="size-11 sm:size-8"
										onClick={() => setRemoveOpen(true)}
										disabled={deleteMutation.isPending}
										aria-label={m["library.access_remove"]()}
									>
										<Trash />
									</Button>
								)}
							</div>

							<Separator />

							<div className="flex flex-col gap-7">
								{OVERRIDABLE.map(([resource, actions]) => (
									<section key={resource} className="flex flex-col gap-2">
										<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											{RESOURCE_LABELS[resource]?.() ?? resource}
										</h4>
										<div className="flex flex-col">
											{actions.map((action) => {
												const state = stateOf(draft, resource, action);
												return (
													<div
														key={action}
														className="flex flex-col items-start gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
													>
														<span className="text-foreground text-sm">
															{ACTION_LABELS[action]?.() ?? action}
														</span>
														<PermissionToggle
															value={state}
															onChange={(next) =>
																setDraft({
																	...draft,
																	...withState(draft, resource, action, next),
																})
															}
															label={ACTION_LABELS[action]?.() ?? action}
														/>
													</div>
												);
											})}
										</div>
									</section>
								))}
							</div>

							<div className="flex justify-end gap-2 pt-2">
								{draft.id === null && (
									<Button variant="ghost" onClick={() => setDraft(null)}>
										{m["common.cancel"]()}
									</Button>
								)}
								<Button
									disabled={!changed || upsertMutation.isPending}
									onClick={() =>
										upsertMutation.mutate({
											libraryId,
											subjectType: draft.subjectType,
											subjectId: draft.subjectId,
											allow: draft.allow,
											deny: draft.deny,
										})
									}
								>
									{upsertMutation.isPending && (
										<CircleNotch
											data-icon="inline-start"
											className="animate-spin"
										/>
									)}
									{m["library.access_save"]()}
								</Button>
							</div>
						</div>
					) : (
						<div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
							<Shield className="size-10 text-muted-foreground" />
							<div className="flex flex-col gap-1">
								<h3 className="font-medium text-foreground">
									{m["library.access_select_title"]()}
								</h3>
								<p className="max-w-sm text-muted-foreground text-sm">
									{m["library.access_select_desc"]()}
								</p>
							</div>
						</div>
					)}
				</section>
			</div>

			<Modal
				open={addOpen}
				onOpenChange={setAddOpen}
				title={m["library.access_add_subject"]()}
				description={m["library.access_add_subject_desc"]()}
				className="sm:max-w-lg"
			>
				<div className="flex max-h-[420px] flex-col gap-5 overflow-y-auto">
					{everyoneAvailable && (
						<SubjectOption
							type="everyone"
							name="@everyone"
							description={m["library.access_everyone_desc"]()}
							onClick={() =>
								requestSelection({
									kind: "new",
									subjectType: "everyone",
									subjectId: null,
								})
							}
						/>
					)}

					{availableRoles.length > 0 && (
						<section className="flex flex-col gap-1">
							<h3 className="px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{m["library.access_roles"]()}
							</h3>
							{availableRoles.map((role) => (
								<SubjectOption
									key={role.id}
									type="role"
									name={role.name}
									onClick={() =>
										requestSelection({
											kind: "new",
											subjectType: "role",
											subjectId: role.id,
										})
									}
								/>
							))}
						</section>
					)}

					{availableMembers.length > 0 && (
						<section className="flex flex-col gap-1">
							<h3 className="px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{m["library.access_members"]()}
							</h3>
							{availableMembers.map((member) => (
								<SubjectOption
									key={member.userId}
									type="user"
									name={
										member.user?.name || member.user?.email || member.userId
									}
									description={member.user?.email ?? undefined}
									onClick={() =>
										requestSelection({
											kind: "new",
											subjectType: "user",
											subjectId: member.userId,
										})
									}
								/>
							))}
						</section>
					)}

					{!everyoneAvailable &&
						availableRoles.length === 0 &&
						availableMembers.length === 0 && (
							<p className="py-8 text-center text-muted-foreground text-sm">
								{m["library.access_no_available_subjects"]()}
							</p>
						)}
				</div>
			</Modal>

			<Modal
				open={discardOpen}
				onOpenChange={(open) => {
					setDiscardOpen(open);
					if (!open) setPendingSelection(null);
				}}
				title={m["library.unsaved_title"]()}
				description={m["library.access_unsaved_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => {
								setPendingSelection(null);
								setDiscardOpen(false);
							}}
						>
							{m["library.keep_editing"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={applyPendingSelection}
						>
							{m["library.discard_changes"]()}
						</Button>
					</>
				}
			/>

			<Modal
				open={removeOpen}
				onOpenChange={setRemoveOpen}
				title={m["library.access_remove_title"]()}
				description={
					draft
						? m["library.access_remove_desc"]({ name: subjectName(draft) })
						: undefined
				}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={deleteMutation.isPending}
							onClick={() => setRemoveOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={draft?.id == null || deleteMutation.isPending}
							onClick={() => {
								if (draft?.id != null) deleteMutation.mutate({ id: draft.id });
							}}
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
		</>
	);
}

function SubjectButton({
	type,
	name,
	active,
	onClick,
}: {
	type: SubjectType;
	name: string;
	active: boolean;
	onClick: () => void;
}) {
	const Icon =
		type === "everyone" ? UsersThree : type === "role" ? Shield : User;
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 md:min-h-0",
				active
					? "bg-muted text-foreground"
					: "text-muted-foreground hover:bg-muted/60",
			)}
		>
			<Icon className="size-4 shrink-0" />
			<span className="truncate font-medium text-sm">{name}</span>
		</button>
	);
}

function SubjectOption({
	type,
	name,
	description,
	onClick,
}: {
	type: SubjectType;
	name: string;
	description?: string;
	onClick: () => void;
}) {
	const Icon =
		type === "everyone" ? UsersThree : type === "role" ? Shield : User;
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60"
		>
			<div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
				<Icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-foreground text-sm">{name}</p>
				{description && (
					<p className="truncate text-muted-foreground text-xs">
						{description}
					</p>
				)}
			</div>
		</button>
	);
}

function PermissionToggle({
	value,
	onChange,
	label,
}: {
	value: TriState;
	onChange: (value: TriState) => void;
	label: string;
}) {
	const options: { value: TriState; icon: typeof Minus; label: string }[] = [
		{
			value: "inherit",
			icon: Minus,
			label: m["library.access_inherit"](),
		},
		{ value: "deny", icon: X, label: m["library.access_deny"]() },
		{ value: "allow", icon: Check, label: m["library.access_allow"]() },
	];

	return (
		<div className="flex w-full shrink-0 items-center gap-1 rounded-xl bg-muted/50 p-1 sm:w-auto">
			{options.map((option) => {
				const Icon = option.icon;
				return (
					<button
						key={option.value}
						type="button"
						onClick={() => onChange(option.value)}
						className={cn(
							"flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-muted-foreground text-xs outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 sm:h-8 sm:flex-none",
							value === option.value &&
								option.value === "inherit" &&
								"bg-background text-foreground shadow-sm",
							value === option.value &&
								option.value === "deny" &&
								"bg-destructive text-destructive-foreground",
							value === option.value &&
								option.value === "allow" &&
								"bg-primary text-primary-foreground",
						)}
						aria-label={`${option.label}: ${label}`}
						aria-pressed={value === option.value}
						title={option.label}
					>
						<Icon className="size-3.5" weight="bold" />
						<span>{option.label}</span>
					</button>
				);
			})}
		</div>
	);
}
