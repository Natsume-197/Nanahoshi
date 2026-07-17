import { CircleNotch } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DangerZone } from "@/components/settings/sections/danger-zone";
import { ServerBranding } from "@/components/settings/sections/server-branding";
import { SettingRow, SettingRows } from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
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

	const current = editing === "slug" ? (org.slug ?? "") : org.name;
	const changed = draft.trim() !== current;
	const valid =
		editing === "slug"
			? SLUG_PATTERN.test(draft.trim())
			: draft.trim().length > 0;

	const openEditor = (field: EditableField) => {
		setDraft(field === "slug" ? (org.slug ?? "") : org.name);
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
					if (!open) setEditing(null);
				}}
				title={
					editing === "slug"
						? m["settings.org.edit_slug"]()
						: m["settings.org.edit_name"]()
				}
				description={
					editing === "slug" ? m["settings.org.slug_hint"]() : undefined
				}
				onSubmit={(event) => {
					event.preventDefault();
					if (editing && changed && valid) updateMutation.mutate(editing);
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setEditing(null)}
							disabled={updateMutation.isPending}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={!changed || !valid || updateMutation.isPending}
						>
							{updateMutation.isPending && (
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
				<Input
					autoFocus
					value={draft}
					onChange={(event) =>
						setDraft(
							editing === "slug"
								? normalizeSlug(event.target.value)
								: event.target.value,
						)
					}
					disabled={updateMutation.isPending}
				/>
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
