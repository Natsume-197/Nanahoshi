import { CircleNotch } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DangerZone } from "@/components/settings/sections/danger-zone";
import { ServerBranding } from "@/components/settings/sections/server-branding";
import { SettingRow, SettingRows } from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

export function ServerGeneral() {
	const { can } = useAbilities();
	const canEdit = can("settings", "update");
	const {
		data: org,
		isPending: isOrgLoading,
		refetch: refetchOrg,
	} = authClient.useActiveOrganization();

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.org.overview"]()}
				</h2>
				{isOrgLoading ? (
					<OverviewSkeleton />
				) : org ? (
					<OverviewDetails
						key={org.id}
						org={org}
						canEdit={canEdit}
						refetchOrg={refetchOrg}
					/>
				) : (
					<p className="text-muted-foreground text-sm">
						{m["settings.org.none_selected"]()}
					</p>
				)}
			</section>

			<ServerBranding />

			<DangerZone />
		</div>
	);
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;
type EditableField = "name" | "slug";

function normalizeSlug(value: string) {
	return value
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "");
}

/** Name + slug rows with Discord-style "Edit → modal" flow, plus the created date. */
function OverviewDetails({
	org,
	canEdit,
	refetchOrg,
}: {
	org: { id: string; name: string; slug?: string | null };
	canEdit: boolean;
	refetchOrg: () => void;
}) {
	const [editing, setEditing] = useState<EditableField | null>(null);
	const [draft, setDraft] = useState("");
	const [submitAttempted, setSubmitAttempted] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const current = editing === "slug" ? (org.slug ?? "") : org.name;
	const changed = draft.trim() !== current;
	const validationError =
		editing === "slug"
			? SLUG_PATTERN.test(draft.trim())
				? null
				: m["settings.org.slug_invalid"]()
			: draft.trim().length > 0
				? null
				: m["settings.org.name_required"]();

	const openEditor = (field: EditableField) => {
		setDraft(field === "slug" ? (org.slug ?? "") : org.name);
		setSubmitAttempted(false);
		setEditing(field);
	};

	const updateMutation = useMutation({
		mutationFn: async (field: EditableField) => {
			const { error } = await authClient.organization.update({
				organizationId: org.id,
				data: { [field]: draft.trim() },
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			refetchOrg();
			toast.success(m["settings.org.updated"]());
			setEditing(null);
		},
		onError: (error) =>
			toast.error(
				error instanceof Error && error.message
					? error.message
					: m["settings.org.update_failed"](),
			),
	});

	return (
		<>
			<SettingRows>
				<SettingRow
					label={m["settings.org.name"]()}
					value={org.name}
					onEdit={canEdit ? () => openEditor("name") : undefined}
					editLabel={m["common.edit"]()}
				/>
				<SettingRow
					label={m["settings.org.slug"]()}
					value={`/${org.slug ?? ""}`}
					onEdit={canEdit ? () => openEditor("slug") : undefined}
					editLabel={m["common.edit"]()}
				/>
			</SettingRows>

			<Modal
				open={editing !== null}
				onOpenChange={(open) => {
					if (!open) {
						setSubmitAttempted(false);
						setEditing(null);
					}
				}}
				title={
					editing === "slug"
						? m["settings.org.edit_slug"]()
						: m["settings.org.edit_name"]()
				}
				onSubmit={(event) => {
					event.preventDefault();
					setSubmitAttempted(true);
					if (validationError) {
						inputRef.current?.focus();
						return;
					}
					if (!changed) {
						setEditing(null);
						return;
					}
					if (editing) updateMutation.mutate(editing);
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => {
								setSubmitAttempted(false);
								setEditing(null);
							}}
							disabled={updateMutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={updateMutation.isPending}
							aria-busy={updateMutation.isPending || undefined}
						>
							{updateMutation.isPending && (
								<CircleNotch
									aria-hidden="true"
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["common.save"]()}
						</Button>
					</>
				}
			>
				<Field data-invalid={submitAttempted && !!validationError}>
					<FieldLabel htmlFor="server-detail-value">
						{editing === "slug"
							? m["settings.org.slug"]()
							: m["settings.org.name"]()}
					</FieldLabel>
					<Input
						ref={inputRef}
						id="server-detail-value"
						name={editing ?? undefined}
						autoFocus
						autoComplete="off"
						autoCapitalize={editing === "slug" ? "none" : undefined}
						spellCheck={editing !== "slug"}
						value={draft}
						onChange={(event) =>
							setDraft(
								editing === "slug"
									? normalizeSlug(event.target.value)
									: event.target.value,
							)
						}
						disabled={updateMutation.isPending}
						aria-invalid={(submitAttempted && !!validationError) || undefined}
						aria-describedby={
							editing === "slug"
								? submitAttempted && validationError
									? "server-slug-hint server-detail-error"
									: "server-slug-hint"
								: submitAttempted && validationError
									? "server-detail-error"
									: undefined
						}
					/>
					{editing === "slug" && (
						<FieldDescription id="server-slug-hint">
							{m["settings.org.slug_hint"]()}
						</FieldDescription>
					)}
					{submitAttempted && validationError && (
						<FieldError id="server-detail-error">{validationError}</FieldError>
					)}
				</Field>
			</Modal>
		</>
	);
}

function OverviewSkeleton() {
	return (
		<SettingRows>
			{["name", "slug"].map((key) => (
				<div
					key={key}
					className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
				>
					<Skeleton className="h-5 w-24" />
					<Skeleton className="h-5 w-40" />
				</div>
			))}
		</SettingRows>
	);
}
