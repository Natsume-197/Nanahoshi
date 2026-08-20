import { env } from "@nanahoshi-v2/env/web";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageEditorDialog } from "@/components/settings/image-editor-dialog";
import { ImageUploadRow } from "@/components/settings/image-upload-row";
import { SettingRows } from "@/components/settings/setting-rows";
import { ServerBadge } from "@/components/shared/server-badge";
import { useAbilities } from "@/hooks/use-abilities";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/avif";
type ImageKind = "logo" | "background";

export function ServerBranding() {
	const { can } = useAbilities();
	const canEdit = can("settings", "update");
	const { data: org, refetch: refetchOrg } = authClient.useActiveOrganization();

	const profileQuery = useQuery({
		...orpc.serverProfile.get.queryOptions(),
		enabled: canEdit,
	});
	const profile = profileQuery.data;

	const logoRef = useRef<HTMLInputElement>(null);
	const backgroundRef = useRef<HTMLInputElement>(null);
	const [editing, setEditing] = useState<{
		file: File;
		kind: ImageKind;
	} | null>(null);

	const invalidateProfile = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.serverProfile.get.queryOptions().queryKey,
		});

	const uploadMutation = useMutation({
		mutationFn: async ({ kind, file }: { kind: ImageKind; file: File }) => {
			if (!file.type.startsWith("image/")) {
				throw new Error(m["settings.profile.invalid_image"]());
			}
			const limit = kind === "logo" ? 5 : 10;
			if (file.size > limit * 1024 * 1024) {
				throw new Error(m["settings.profile.image_too_large"]({ limit }));
			}

			const formData = new FormData();
			formData.set("file", file);

			const response = await fetch(
				`${env.VITE_SERVER_URL}/api/server/${kind}`,
				{ method: "POST", body: formData, credentials: "include" },
			);
			const result = (await response.json().catch(() => null)) as {
				imageUrl?: string;
				message?: string;
			} | null;
			if (!response.ok || !result?.imageUrl) {
				throw new Error(
					result?.message ?? m["settings.profile.upload_failed"](),
				);
			}

			const oldUrl = profile?.[kind];
			await client.serverProfile.update({ [kind]: result.imageUrl });
			if (oldUrl && oldUrl !== result.imageUrl) {
				void fetch(`${env.VITE_SERVER_URL}/api/media/cleanup`, {
					method: "POST",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ kind, oldUrl }),
				});
			}
		},
		onSuccess: async () => {
			setEditing(null);
			invalidateProfile();
			await refetchOrg();
			toast.success(m["toast.photo_updated"]());
		},
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: m["settings.profile.upload_failed"](),
			),
	});

	const clearMutation = useMutation({
		mutationFn: async (kind: ImageKind) => {
			const oldUrl = profile?.[kind];
			await client.serverProfile.update({ [kind]: null });
			if (oldUrl) {
				await fetch(`${env.VITE_SERVER_URL}/api/media/cleanup`, {
					method: "POST",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ kind, oldUrl }),
				});
			}
		},
		onSuccess: async () => {
			invalidateProfile();
			await refetchOrg();
			toast.success(m["toast.profile_reverted"]());
		},
		onError: () => toast.error(m["settings.profile.upload_failed"]()),
	});

	// Open the crop/adjust editor first; the actual upload happens on apply.
	const onFile =
		(kind: ImageKind) => (event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) return;
			setEditing({ file, kind });
			event.target.value = "";
		};

	const onApply = (blob: Blob) => {
		if (!editing) return;
		const file = new File([blob], `${editing.kind}.webp`, {
			type: "image/webp",
		});
		uploadMutation.mutate({ kind: editing.kind, file });
	};

	const uploadingKind = (kind: ImageKind) =>
		uploadMutation.isPending && uploadMutation.variables?.kind === kind;
	const clearingKind = (kind: ImageKind) =>
		clearMutation.isPending && clearMutation.variables === kind;

	// Only members who can edit server settings see the branding controls.
	if (!canEdit) return null;

	const serverName = org?.name ?? profile?.name ?? "";
	const loading = profileQuery.isPending;

	return (
		<>
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.org.branding"]()}
					</h2>
					<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
						{m["settings.org.branding_desc"]()}
					</p>
				</div>
				<SettingRows>
					<ImageUploadRow
						variant="settings"
						title={m["settings.org.logo_title"]()}
						description={m["settings.org.logo_desc"]()}
						loading={loading}
						inputRef={logoRef}
						accept={IMAGE_ACCEPT}
						onChange={onFile("logo")}
						uploading={uploadingKind("logo")}
						preview={
							<ServerBadge
								name={serverName}
								logo={profile?.logo}
								className="size-20 rounded-2xl text-2xl"
							/>
						}
						previewClassName="size-20 rounded-2xl"
						actionLabel={m["settings.profile.change_photo"]()}
						onClear={
							profile?.logo ? () => clearMutation.mutate("logo") : undefined
						}
						clearing={clearingKind("logo")}
						clearLabel={m["settings.org.remove_image"]()}
					/>

					<ImageUploadRow
						variant="settings"
						title={m["settings.org.background_title"]()}
						description={m["settings.org.background_desc"]()}
						loading={loading}
						inputRef={backgroundRef}
						accept={IMAGE_ACCEPT}
						onChange={onFile("background")}
						uploading={uploadingKind("background")}
						preview={<BackgroundPreview src={profile?.background ?? null} />}
						previewClassName="aspect-video w-36 rounded-lg sm:w-48"
						actionLabel={m["settings.profile.change_photo"]()}
						onClear={
							profile?.background
								? () => clearMutation.mutate("background")
								: undefined
						}
						clearing={clearingKind("background")}
						clearLabel={m["settings.org.remove_image"]()}
					/>
				</SettingRows>
			</section>
			<ImageEditorDialog
				file={editing?.file ?? null}
				shape={editing?.kind === "background" ? "rect" : "round"}
				aspect={editing?.kind === "background" ? 16 / 9 : 1}
				onCancel={() => setEditing(null)}
				onApply={onApply}
				applying={uploadMutation.isPending}
			/>
		</>
	);
}

function BackgroundPreview({ src }: { src: string | null }) {
	return (
		<div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-48">
			{src ? (
				<img
					src={src}
					alt={m["settings.org.background_alt"]()}
					className="h-full w-full object-cover"
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center px-2 text-center text-muted-foreground text-xs">
					{m["settings.org.no_background"]()}
				</div>
			)}
		</div>
	);
}
