import { env } from "@nanahoshi-v2/env/web";
import { CircleNotch } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageEditorDialog } from "@/components/settings/image-editor-dialog";
import { ImageUploadRow } from "@/components/settings/image-upload-row";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SESSION_QUERY_KEY } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";
import { getHeaderPreviewUrl } from "@/utils/profile-images";

const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/avif";

type ImageSlot = "avatar" | "header";
type Scope = "global" | "org";

export function ProfileSettings() {
	const profileQuery = useQuery(orpc.profile.getProfile.queryOptions());
	const profile = profileQuery.data;
	const { data: activeOrg } = authClient.useActiveOrganization();

	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [globalBio, setGlobalBio] = useState("");
	const [orgBio, setOrgBio] = useState("");
	const [accountSubmitAttempted, setAccountSubmitAttempted] = useState(false);

	const nameInputRef = useRef<HTMLInputElement>(null);
	const usernameInputRef = useRef<HTMLInputElement>(null);
	const globalAvatarRef = useRef<HTMLInputElement>(null);
	const globalHeaderRef = useRef<HTMLInputElement>(null);
	const orgAvatarRef = useRef<HTMLInputElement>(null);
	const orgHeaderRef = useRef<HTMLInputElement>(null);
	// Start empty so a profile that was already prefetched before the first
	// render still hydrates the editable form fields.
	const prevProfileRef = useRef<typeof profile>(undefined);
	const [editing, setEditing] = useState<{
		file: File;
		slot: ImageSlot;
		scope: Scope;
	} | null>(null);

	// Sync form state when profile data loads or changes (Rule 5: render-phase
	// ref tracking instead of useEffect).
	if (profile && profile !== prevProfileRef.current) {
		prevProfileRef.current = profile;
		setName(profile.name ?? "");
		setUsername(globalStr(profile.username) ?? "");
		setGlobalBio(globalStr(profile.globalBio) ?? "");
		setOrgBio(globalStr(profile.orgBio) ?? "");
	}

	const profileUsername =
		profile && "username" in profile ? (profile.username as string) : null;

	// Global account-level values (the per-community overrides fall back to these)
	const globalImage = globalStr(profile?.globalImage);
	const globalHeader = globalStr(profile?.globalHeaderImage);
	// Raw overrides — null means "inheriting the account default"
	const orgImage = globalStr(profile?.orgImage);
	const orgHeader = globalStr(profile?.orgHeaderImage);
	const hasOrgAvatar = orgImage != null;
	const hasOrgHeader = orgHeader != null;
	const hasOrgBio = globalStr(profile?.orgBio) != null;

	const accountChanged = profile
		? name !== (profile.name ?? "") ||
			username !== (profileUsername ?? "") ||
			globalBio !== (globalStr(profile.globalBio) ?? "")
		: false;
	const nameError = name.trim()
		? null
		: m["settings.profile.full_name_required"]();
	const usernameError =
		username.length < 3
			? m["auth.err.username_min"]()
			: username.length > 30
				? m["auth.err.username_max"]()
				: !/^[a-zA-Z0-9_.]+$/.test(username)
					? m["auth.err.username_chars"]()
					: null;
	const orgBioChanged = profile
		? orgBio !== (globalStr(profile.orgBio) ?? "")
		: false;

	const invalidateProfile = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.profile.getProfile.queryOptions().queryKey,
		});

	// --- Account (global) save: name + username + global bio ---
	const accountMutation = useMutation({
		mutationFn: async (data: {
			name?: string;
			username?: string;
			bio?: string;
		}) => {
			if (data.name !== undefined || data.username !== undefined) {
				const { error } = await authClient.updateUser({
					...(data.name !== undefined ? { name: data.name } : {}),
					...(data.username !== undefined
						? {
								username: data.username,
								displayUsername: data.username,
							}
						: {}),
				});
				if (error) throw new Error(error.message);
			}
			if (data.bio !== undefined) {
				await client.profile.updateProfile({ bio: data.bio });
			}
		},
		onSuccess: async () => {
			await Promise.all([
				invalidateProfile(),
				queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
			]);
			setAccountSubmitAttempted(false);
			toast.success(m["toast.profile_updated"]());
		},
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: m["toast.profile_update_failed"](),
			),
	});

	const saveAccount = (event?: FormEvent<HTMLFormElement>) => {
		event?.preventDefault();
		setAccountSubmitAttempted(true);
		if (nameError) {
			nameInputRef.current?.focus();
			return;
		}
		if (usernameError) {
			usernameInputRef.current?.focus();
			return;
		}

		const updates: { name?: string; username?: string; bio?: string } = {};
		if (name !== (profile?.name ?? "")) updates.name = name.trim();
		if (username !== (profileUsername ?? "")) {
			updates.username = username.toLowerCase();
		}
		if (globalBio !== (globalStr(profile?.globalBio) ?? ""))
			updates.bio = globalBio;
		accountMutation.mutate(updates);
	};

	// --- Community (per-org) bio save ---
	const orgBioMutation = useMutation({
		mutationFn: (bio: string | null) =>
			client.profile.updateOrgProfile({ bio }),
		onSuccess: () => {
			invalidateProfile();
			toast.success(m["toast.community_profile_updated"]());
		},
		onError: () => toast.error(m["toast.community_profile_update_failed"]()),
	});

	// --- Image upload (shared endpoint, differs only in where it's saved) ---
	const uploadMutation = useMutation({
		mutationFn: async ({
			slot,
			scope,
			file,
		}: {
			slot: ImageSlot;
			scope: Scope;
			file: File;
		}) => {
			if (!file.type.startsWith("image/")) {
				throw new Error(m["settings.profile.invalid_image"]());
			}
			const limit = slot === "avatar" ? 5 : 10;
			if (file.size > limit * 1024 * 1024) {
				throw new Error(m["settings.profile.image_too_large"]({ limit }));
			}

			const formData = new FormData();
			formData.set("file", file);

			const response = await fetch(
				`${env.VITE_SERVER_URL}/api/profile/${slot}`,
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

			const url = result.imageUrl;
			if (scope === "global") {
				if (slot === "avatar") await authClient.updateUser({ image: url });
				else await client.profile.updateProfile({ headerImage: url });
			} else if (slot === "avatar") {
				await client.profile.updateOrgProfile({ image: url });
			} else {
				await client.profile.updateOrgProfile({ headerImage: url });
			}
		},
		onSuccess: () => {
			setEditing(null);
			invalidateProfile();
			toast.success(m["toast.photo_updated"]());
		},
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: m["settings.profile.upload_failed"](),
			),
	});

	// --- Clear a per-org override (fall back to the account default) ---
	const clearOverrideMutation = useMutation({
		mutationFn: (field: "image" | "headerImage" | "bio") =>
			client.profile.updateOrgProfile({ [field]: null }),
		onSuccess: () => {
			invalidateProfile();
			toast.success(m["toast.profile_reverted"]());
		},
		onError: () => toast.error(m["toast.community_profile_update_failed"]()),
	});

	// Avatars are uploaded untouched so transparent PNGs and their original
	// proportions are preserved. Banners still use the crop/adjust editor.
	const onFile =
		(slot: ImageSlot, scope: Scope) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) return;
			event.target.value = "";

			if (slot === "avatar") {
				uploadMutation.mutate({ slot, scope, file });
				return;
			}

			setEditing({ file, slot, scope });
		};

	const onApplyEdit = (blob: Blob) => {
		if (editing?.slot !== "header") return;
		const file = new File([blob], `${editing.slot}.webp`, {
			type: "image/webp",
		});
		uploadMutation.mutate({ slot: editing.slot, scope: editing.scope, file });
	};

	const uploadingMatches = (slot: ImageSlot, scope: Scope) =>
		uploadMutation.isPending &&
		uploadMutation.variables?.slot === slot &&
		uploadMutation.variables?.scope === scope;

	return (
		<div className="flex flex-col gap-12">
			{/* ===================== ACCOUNT (GLOBAL) ===================== */}
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.profile.account_profile"]()}
					</h2>
					<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
						{m["settings.profile.account_defaults_desc"]()}
					</p>
				</div>

				<form className="flex flex-col gap-5" onSubmit={saveAccount} noValidate>
					<SettingRows>
						<ImageUploadRow
							variant="settings"
							title={m["settings.profile.profile_photo"]()}
							description={m["settings.profile.profile_photo_desc"]()}
							loading={!profile}
							inputRef={globalAvatarRef}
							accept={AVATAR_ACCEPT}
							onChange={onFile("avatar", "global")}
							uploading={uploadingMatches("avatar", "global")}
							preview={
								<UserAvatar
									name={profile?.name}
									image={globalImage}
									className="size-20 shrink-0"
									fallbackClassName="text-xl"
								/>
							}
							previewClassName="size-20 rounded-full"
							actionLabel={
								globalImage
									? m["settings.profile.change_photo"]()
									: m["settings.profile.upload_photo"]()
							}
						/>

						<ImageUploadRow
							variant="settings"
							title={m["settings.profile.profile_banner"]()}
							description={m["settings.profile.profile_banner_desc"]()}
							loading={!profile}
							inputRef={globalHeaderRef}
							accept={AVATAR_ACCEPT}
							onChange={onFile("header", "global")}
							uploading={uploadingMatches("header", "global")}
							preview={<BannerPreview src={globalHeader} />}
							previewClassName="aspect-[4/1] w-36 rounded-lg sm:w-48"
							actionLabel={
								globalHeader
									? m["settings.profile.change_banner"]()
									: m["settings.profile.upload_banner"]()
							}
						/>

						<SettingControlRow
							label={
								<Label htmlFor="name">
									{m["settings.profile.full_name"]()}
								</Label>
							}
							controlClassName="sm:w-80"
						>
							{profile ? (
								<div
									className="flex flex-col gap-1.5"
									data-invalid={!!nameError}
								>
									<Input
										ref={nameInputRef}
										id="name"
										name="name"
										autoComplete="name"
										value={name}
										onChange={(event) => setName(event.target.value)}
										placeholder={m["auth.name_placeholder"]()}
										aria-invalid={
											(accountSubmitAttempted && nameError != null) || undefined
										}
										aria-describedby={
											accountSubmitAttempted && nameError
												? "profile-name-error"
												: undefined
										}
									/>
									{accountSubmitAttempted && nameError && (
										<FieldError id="profile-name-error">{nameError}</FieldError>
									)}
								</div>
							) : (
								<Skeleton className="h-8 w-full" />
							)}
						</SettingControlRow>
						<SettingControlRow
							label={<Label htmlFor="username">{m["auth.username"]()}</Label>}
							controlClassName="sm:w-80"
						>
							{profile ? (
								<div
									className="flex flex-col gap-1.5"
									data-invalid={!!usernameError}
								>
									<Input
										ref={usernameInputRef}
										id="username"
										name="username"
										autoComplete="username"
										autoCapitalize="none"
										spellCheck={false}
										value={username}
										onChange={(event) => setUsername(event.target.value)}
										placeholder={m["auth.username_placeholder"]()}
										maxLength={30}
										aria-invalid={
											(accountSubmitAttempted && usernameError != null) ||
											undefined
										}
										aria-describedby={
											accountSubmitAttempted && usernameError
												? "username-error"
												: undefined
										}
									/>
									{accountSubmitAttempted && usernameError && (
										<FieldError id="username-error">{usernameError}</FieldError>
									)}
								</div>
							) : (
								<Skeleton className="h-8 w-full" />
							)}
						</SettingControlRow>
						<SettingControlRow
							label={<Label htmlFor="email">{m["auth.email"]()}</Label>}
							controlClassName="sm:w-80"
						>
							{profile ? (
								<Input
									id="email"
									name="email"
									type="email"
									autoComplete="email"
									value={profile.email}
									readOnly
									aria-readonly="true"
								/>
							) : (
								<Skeleton className="h-8 w-full" />
							)}
						</SettingControlRow>
						<SettingControlRow
							label={
								<Label htmlFor="profile-bio">
									{m["settings.profile.bio"]()}
								</Label>
							}
							controlClassName="sm:w-[28rem]"
						>
							{profile ? (
								<>
									<Textarea
										id="profile-bio"
										name="bio"
										value={globalBio}
										onChange={(e) => setGlobalBio(e.target.value)}
										placeholder={m["settings.profile.bio_placeholder"]()}
										maxLength={2000}
										rows={4}
										aria-describedby="profile-bio-count"
									/>
									<p
										id="profile-bio-count"
										className="text-end text-muted-foreground text-xs tabular-nums"
									>
										{m["settings.profile.character_count"]({
											count: globalBio.length,
											limit: 2000,
										})}
									</p>
								</>
							) : (
								<Skeleton className="h-24 w-full" />
							)}
						</SettingControlRow>
					</SettingRows>

					{accountChanged && (
						<div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 rounded-2xl bg-background/95 p-3 shadow-card ring-1 ring-border/60 backdrop-blur-sm">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => {
									setName(profile?.name ?? "");
									setUsername(profileUsername ?? "");
									setGlobalBio(globalStr(profile?.globalBio) ?? "");
									setAccountSubmitAttempted(false);
								}}
								disabled={accountMutation.isPending}
							>
								{m["settings.profile.discard"]()}
							</Button>
							<Button
								type="submit"
								size="sm"
								disabled={accountMutation.isPending}
								aria-busy={accountMutation.isPending || undefined}
							>
								{accountMutation.isPending && (
									<CircleNotch
										aria-hidden="true"
										data-icon="inline-start"
										className="animate-spin"
									/>
								)}
								{m["settings.profile.save_changes"]()}
							</Button>
						</div>
					)}
				</form>
			</section>

			{/* ===================== COMMUNITY (PER-ORG) ===================== */}
			{activeOrg && (
				<section className="flex flex-col gap-6">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-foreground text-xl">
							{m["settings.profile.community_title"]({
								name: activeOrg.name,
							})}
						</h2>
						<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
							{m["settings.profile.community_desc"]({
								name: activeOrg.name,
							})}
						</p>
					</div>

					<SettingRows>
						<ImageUploadRow
							variant="settings"
							title={m["settings.profile.community_photo"]()}
							description={
								hasOrgAvatar
									? m["settings.profile.shown_only_community"]()
									: m["settings.profile.using_account_photo"]()
							}
							loading={!profile}
							inputRef={orgAvatarRef}
							accept={AVATAR_ACCEPT}
							onChange={onFile("avatar", "org")}
							uploading={uploadingMatches("avatar", "org")}
							preview={
								<UserAvatar
									name={profile?.name}
									image={orgImage ?? globalImage}
									className="size-20 shrink-0"
									fallbackClassName="text-xl"
								/>
							}
							previewClassName="size-20 rounded-full"
							actionLabel={
								hasOrgAvatar
									? m["settings.profile.change_photo"]()
									: m["settings.profile.upload_photo"]()
							}
							onClear={
								hasOrgAvatar
									? () => clearOverrideMutation.mutate("image")
									: undefined
							}
							clearing={
								clearOverrideMutation.isPending &&
								clearOverrideMutation.variables === "image"
							}
						/>

						<ImageUploadRow
							variant="settings"
							title={m["settings.profile.community_banner"]()}
							description={
								hasOrgHeader
									? m["settings.profile.shown_only_community"]()
									: m["settings.profile.using_account_banner"]()
							}
							loading={!profile}
							inputRef={orgHeaderRef}
							accept={AVATAR_ACCEPT}
							onChange={onFile("header", "org")}
							uploading={uploadingMatches("header", "org")}
							preview={<BannerPreview src={orgHeader ?? globalHeader} />}
							previewClassName="aspect-[4/1] w-36 rounded-lg sm:w-48"
							actionLabel={
								hasOrgHeader
									? m["settings.profile.change_banner"]()
									: m["settings.profile.upload_banner"]()
							}
							onClear={
								hasOrgHeader
									? () => clearOverrideMutation.mutate("headerImage")
									: undefined
							}
							clearing={
								clearOverrideMutation.isPending &&
								clearOverrideMutation.variables === "headerImage"
							}
						/>
						<SettingControlRow
							label={
								<div className="flex items-center gap-2">
									<Label htmlFor="community-bio">
										{m["settings.profile.community_bio"]()}
									</Label>
									{hasOrgBio && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="text-muted-foreground text-xs"
											onClick={() => clearOverrideMutation.mutate("bio")}
											disabled={clearOverrideMutation.isPending}
										>
											{m["settings.profile.use_account_default"]()}
										</Button>
									)}
								</div>
							}
							controlClassName="sm:w-[28rem]"
						>
							<div className="flex flex-col gap-2">
								{profile ? (
									<>
										<Textarea
											id="community-bio"
											name="community-bio"
											value={orgBio}
											onChange={(e) => setOrgBio(e.target.value)}
											placeholder={
												globalStr(profile.globalBio) ??
												m["settings.profile.community_bio_placeholder"]()
											}
											maxLength={2000}
											rows={4}
											aria-describedby="community-bio-status community-bio-count"
										/>
										<div className="flex items-center justify-between">
											<span
												id="community-bio-status"
												role="status"
												className="text-muted-foreground text-xs"
											>
												{orgBioChanged
													? m["settings.profile.unsaved_changes"]()
													: ""}
											</span>
											<div className="flex items-center gap-2">
												<span
													id="community-bio-count"
													className="text-muted-foreground text-xs tabular-nums"
												>
													{m["settings.profile.character_count"]({
														count: orgBio.length,
														limit: 2000,
													})}
												</span>
												{orgBioChanged && (
													<Button
														size="sm"
														onClick={() =>
															orgBioMutation.mutate(orgBio || null)
														}
														disabled={orgBioMutation.isPending}
													>
														{orgBioMutation.isPending && (
															<CircleNotch
																aria-hidden="true"
																data-icon="inline-start"
																className="animate-spin"
															/>
														)}
														{m["common.save"]()}
													</Button>
												)}
											</div>
										</div>
									</>
								) : (
									<Skeleton className="h-24 w-full" />
								)}
							</div>
						</SettingControlRow>
					</SettingRows>
				</section>
			)}
			<ImageEditorDialog
				file={editing?.file ?? null}
				shape="rect"
				aspect={4 / 1}
				onCancel={() => setEditing(null)}
				onApply={onApplyEdit}
				applying={uploadMutation.isPending}
			/>
		</div>
	);
}

/** oRPC client types these loosely (string | null | unknown); coerce to string. */
function globalStr(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function BannerPreview({ src }: { src: string | null }) {
	return (
		<div className="relative h-full w-full shrink-0 overflow-hidden rounded-[inherit] bg-muted">
			{src ? (
				<img
					src={getHeaderPreviewUrl(src)}
					alt={m["settings.profile.banner_alt"]()}
					className="h-full w-full object-cover"
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
					{m["settings.profile.no_banner"]()}
				</div>
			)}
		</div>
	);
}
