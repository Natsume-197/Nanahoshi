import { env } from "@nanahoshi-v2/env/web";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/settings/profile")({
	component: ProfileSettings,
});

const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/avif";

type ImageSlot = "avatar" | "header";
type Scope = "global" | "org";

export function ProfileSettings() {
	const profileQuery = useQuery(orpc.profile.getProfile.queryOptions());
	const profile = profileQuery.data;
	const { data: activeOrg } = authClient.useActiveOrganization();

	const [name, setName] = useState("");
	const [globalBio, setGlobalBio] = useState("");
	const [orgBio, setOrgBio] = useState("");

	const globalAvatarRef = useRef<HTMLInputElement>(null);
	const globalHeaderRef = useRef<HTMLInputElement>(null);
	const orgAvatarRef = useRef<HTMLInputElement>(null);
	const orgHeaderRef = useRef<HTMLInputElement>(null);
	const prevProfileRef = useRef(profile);

	// Sync form state when profile data loads or changes (Rule 5: render-phase
	// ref tracking instead of useEffect).
	if (profile && profile !== prevProfileRef.current) {
		prevProfileRef.current = profile;
		setName(profile.name ?? "");
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
			globalBio !== (globalStr(profile.globalBio) ?? "")
		: false;
	const orgBioChanged = profile
		? orgBio !== (globalStr(profile.orgBio) ?? "")
		: false;

	const invalidateProfile = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.profile.getProfile.queryOptions().queryKey,
		});

	// --- Account (global) save: name + global bio ---
	const accountMutation = useMutation({
		mutationFn: async (data: { name?: string; bio?: string }) => {
			if (data.name !== undefined) {
				await authClient.updateUser({ name: data.name });
			}
			if (data.bio !== undefined) {
				await client.profile.updateProfile({ bio: data.bio });
			}
		},
		onSuccess: () => {
			invalidateProfile();
			toast.success("Account profile updated");
		},
		onError: () => toast.error("Failed to update profile"),
	});

	const saveAccount = () => {
		const updates: { name?: string; bio?: string } = {};
		if (name !== (profile?.name ?? "")) updates.name = name;
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
			toast.success("Community profile updated");
		},
		onError: () => toast.error("Failed to update community profile"),
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
				throw new Error("Please choose a valid image file");
			}
			const limit = slot === "avatar" ? 5 : 10;
			if (file.size > limit * 1024 * 1024) {
				throw new Error(`Image must be ${limit}MB or smaller`);
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
				throw new Error(result?.message ?? "Failed to upload image");
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
			invalidateProfile();
			toast.success("Photo updated");
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to upload image",
			),
	});

	// --- Clear a per-org override (fall back to the account default) ---
	const clearOverrideMutation = useMutation({
		mutationFn: (field: "image" | "headerImage" | "bio") =>
			client.profile.updateOrgProfile({ [field]: null }),
		onSuccess: () => {
			invalidateProfile();
			toast.success("Reverted to account default");
		},
		onError: () => toast.error("Failed to update community profile"),
	});

	const onFile =
		(slot: ImageSlot, scope: Scope) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) return;
			uploadMutation.mutate({ slot, scope, file });
			event.target.value = "";
		};

	const uploadingMatches = (slot: ImageSlot, scope: Scope) =>
		uploadMutation.isPending &&
		uploadMutation.variables?.slot === slot &&
		uploadMutation.variables?.scope === scope;

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Profile</h2>
				<p className="text-muted-foreground text-sm">
					Your account profile is shared everywhere. Per-community overrides
					only apply inside that workspace.
				</p>
			</div>

			{/* ===================== ACCOUNT (GLOBAL) ===================== */}
			<section className="space-y-6">
				<div>
					<h3 className="font-semibold text-lg">Account profile</h3>
					<p className="text-muted-foreground text-sm">
						The defaults shown in every community.
					</p>
				</div>

				<ImageRow
					title="Profile photo"
					description="Upload a JPG, PNG, or WebP image up to 5MB."
					loading={!profile}
					inputRef={globalAvatarRef}
					accept={AVATAR_ACCEPT}
					onChange={onFile("avatar", "global")}
					uploading={uploadingMatches("avatar", "global")}
					preview={
						<UserAvatar
							name={profile?.name}
							image={globalImage}
							className="size-16 shrink-0"
							fallbackClassName="text-lg"
						/>
					}
					actionLabel={globalImage ? "Change photo" : "Upload photo"}
				/>

				<ImageRow
					title="Profile banner"
					description="Wide image shown at the top of your profile. Max 10MB."
					loading={!profile}
					inputRef={globalHeaderRef}
					accept={AVATAR_ACCEPT}
					onChange={onFile("header", "global")}
					uploading={uploadingMatches("header", "global")}
					preview={<BannerPreview src={globalHeader} />}
					actionLabel={globalHeader ? "Change banner" : "Upload banner"}
				/>

				<div className="grid gap-5 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="name">Full name</Label>
						{profile ? (
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Your name"
							/>
						) : (
							<Skeleton className="h-8 w-full" />
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="username">Username</Label>
						{profile ? (
							<Input
								id="username"
								value={profileUsername ? `@${profileUsername}` : ""}
								disabled
								className="opacity-60"
							/>
						) : (
							<Skeleton className="h-8 w-full" />
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						{profile ? (
							<Input
								id="email"
								value={profile.email}
								disabled
								className="opacity-60"
							/>
						) : (
							<Skeleton className="h-8 w-full" />
						)}
					</div>
				</div>

				<div className="space-y-2">
					<Label>Bio</Label>
					{profile ? (
						<>
							<Textarea
								value={globalBio}
								onChange={(e) => setGlobalBio(e.target.value)}
								placeholder="Write something about yourself..."
								maxLength={500}
								rows={4}
							/>
							<p className="text-right text-muted-foreground text-xs">
								{globalBio.length}/500
							</p>
						</>
					) : (
						<Skeleton className="h-24 w-full" />
					)}
				</div>

				{accountChanged && (
					<div className="flex items-center justify-end gap-3 border-border border-t pt-5">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setName(profile?.name ?? "");
								setGlobalBio(globalStr(profile?.globalBio) ?? "");
							}}
						>
							Discard
						</Button>
						<Button
							size="sm"
							onClick={saveAccount}
							disabled={accountMutation.isPending}
						>
							{accountMutation.isPending && (
								<Loader2 className="mr-1.5 size-3.5 animate-spin" />
							)}
							Save changes
						</Button>
					</div>
				)}
			</section>

			{/* ===================== COMMUNITY (PER-ORG) ===================== */}
			{activeOrg && (
				<>
					<Separator />
					<section className="space-y-6">
						<div>
							<h3 className="font-semibold text-lg">
								This community — {activeOrg.name}
							</h3>
							<p className="text-muted-foreground text-sm">
								Customize how you appear inside {activeOrg.name}. Leave empty to
								use your account defaults.
							</p>
						</div>

						<ImageRow
							title="Community photo"
							description={
								hasOrgAvatar
									? "Shown only in this community."
									: "Using your account photo."
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
									className="size-16 shrink-0"
									fallbackClassName="text-lg"
								/>
							}
							actionLabel={hasOrgAvatar ? "Change photo" : "Upload photo"}
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

						<ImageRow
							title="Community banner"
							description={
								hasOrgHeader
									? "Shown only in this community."
									: "Using your account banner."
							}
							loading={!profile}
							inputRef={orgHeaderRef}
							accept={AVATAR_ACCEPT}
							onChange={onFile("header", "org")}
							uploading={uploadingMatches("header", "org")}
							preview={<BannerPreview src={orgHeader ?? globalHeader} />}
							actionLabel={hasOrgHeader ? "Change banner" : "Upload banner"}
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

						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label>Community bio</Label>
								{hasOrgBio && (
									<Button
										variant="ghost"
										size="sm"
										className="h-auto px-1 py-0 text-muted-foreground text-xs"
										onClick={() => clearOverrideMutation.mutate("bio")}
										disabled={clearOverrideMutation.isPending}
									>
										Use account default
									</Button>
								)}
							</div>
							{profile ? (
								<>
									<Textarea
										value={orgBio}
										onChange={(e) => setOrgBio(e.target.value)}
										placeholder={
											globalStr(profile.globalBio) ??
											"Write something for this community..."
										}
										maxLength={500}
										rows={4}
									/>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground text-xs">
											{orgBioChanged ? "Unsaved changes" : ""}
										</span>
										<div className="flex items-center gap-2">
											<span className="text-muted-foreground text-xs">
												{orgBio.length}/500
											</span>
											{orgBioChanged && (
												<Button
													size="sm"
													onClick={() => orgBioMutation.mutate(orgBio || null)}
													disabled={orgBioMutation.isPending}
												>
													{orgBioMutation.isPending && (
														<Loader2 className="mr-1.5 size-3.5 animate-spin" />
													)}
													Save
												</Button>
											)}
										</div>
									</div>
								</>
							) : (
								<Skeleton className="h-24 w-full" />
							)}
						</div>
					</section>
				</>
			)}
		</div>
	);
}

/** oRPC client types these loosely (string | null | unknown); coerce to string. */
function globalStr(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function BannerPreview({ src }: { src: string | null }) {
	return (
		<div className="relative h-20 w-full shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border/60 sm:w-48">
			{src ? (
				<img src={src} alt="Banner" className="h-full w-full object-cover" />
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
					No banner
				</div>
			)}
		</div>
	);
}

function ImageRow({
	title,
	description,
	loading,
	inputRef,
	accept,
	onChange,
	uploading,
	preview,
	actionLabel,
	onClear,
	clearing,
}: {
	title: string;
	description: string;
	loading: boolean;
	inputRef: React.RefObject<HTMLInputElement | null>;
	accept: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	uploading: boolean;
	preview: React.ReactNode;
	actionLabel: string;
	onClear?: () => void;
	clearing?: boolean;
}) {
	return (
		<div className="rounded-2xl border border-border/60 bg-card/50 p-4">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
				{loading ? <Skeleton className="size-16 rounded-full" /> : preview}
				<div className="min-w-0 flex-1 space-y-1">
					<div>
						<h4 className="font-medium text-sm">{title}</h4>
						<p className="text-muted-foreground text-sm">{description}</p>
					</div>
					<input
						ref={inputRef}
						type="file"
						accept={accept}
						className="hidden"
						onChange={onChange}
					/>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => inputRef.current?.click()}
							disabled={loading || uploading}
						>
							{uploading && (
								<Loader2 className="mr-1.5 size-3.5 animate-spin" />
							)}
							{actionLabel}
						</Button>
						{onClear && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="text-muted-foreground"
								onClick={onClear}
								disabled={clearing}
							>
								{clearing && (
									<Loader2 className="mr-1.5 size-3.5 animate-spin" />
								)}
								Use account default
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
