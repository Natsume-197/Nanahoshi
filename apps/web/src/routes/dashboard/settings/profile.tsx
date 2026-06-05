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

function ProfileSettings() {
	const profileQuery = useQuery(orpc.profile.getProfile.queryOptions());
	const profile = profileQuery.data;

	const [name, setName] = useState("");
	const [bio, setBio] = useState("");
	const avatarInputRef = useRef<HTMLInputElement>(null);
	const headerInputRef = useRef<HTMLInputElement>(null);
	const prevProfileRef = useRef(profile);

	// Sync form state when profile data loads or changes (Rule 5: key-like reset via ref tracking)
	if (profile && profile !== prevProfileRef.current) {
		prevProfileRef.current = profile;
		setName(profile.name ?? "");
		setBio(profile.bio ?? "");
	}

	const profileUsername =
		profile && "username" in profile ? (profile.username as string) : null;

	// Derived state (Rule 1): compute inline instead of useEffect + setState
	const hasChanges = profile
		? name !== (profile.name ?? "") || bio !== (profile.bio ?? "")
		: false;

	const updateMutation = useMutation({
		mutationFn: async (data: { name?: string; bio?: string }) => {
			if (data.name !== undefined) {
				await authClient.updateUser({ name: data.name });
			}

			if (data.bio !== undefined) {
				await client.profile.updateProfile({ bio: data.bio });
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getProfile.queryOptions().queryKey,
			});
			toast.success("Profile updated");
		},
		onError: () => toast.error("Failed to update profile"),
	});

	const handleSave = () => {
		const updates: { name?: string; bio?: string } = {};
		if (name !== (profile?.name ?? "")) updates.name = name;
		if (bio !== (profile?.bio ?? "")) updates.bio = bio;
		updateMutation.mutate(updates);
	};

	const uploadMutation = useMutation({
		mutationFn: async ({
			type,
			file,
		}: {
			type: "avatar" | "header";
			file: File;
		}) => {
			if (!file.type.startsWith("image/")) {
				throw new Error("Please choose a valid image file");
			}

			const isAvatar = type === "avatar";
			const limit = isAvatar ? 5 : 10;
			if (file.size > limit * 1024 * 1024) {
				throw new Error(`Image must be ${limit}MB or smaller`);
			}

			const formData = new FormData();
			formData.set("file", file);

			const response = await fetch(
				`${env.VITE_SERVER_URL}/api/profile/${type}`,
				{
					method: "POST",
					body: formData,
					credentials: "include",
				},
			);

			const result = (await response.json().catch(() => null)) as {
				imageUrl?: string;
				message?: string;
			} | null;

			if (!response.ok || !result?.imageUrl) {
				throw new Error(
					result?.message ??
						`Failed to upload ${isAvatar ? "profile photo" : "banner photo"}`,
				);
			}

			if (isAvatar) {
				await authClient.updateUser({ image: result.imageUrl });
			} else {
				await client.profile.updateProfile({ headerImage: result.imageUrl });
			}
		},
		onSuccess: (_, { type }) => {
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getProfile.queryOptions().queryKey,
			});
			toast.success(
				`${type === "avatar" ? "Profile photo" : "Banner photo"} updated`,
			);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to upload image",
			);
		},
	});

	const handleFileChange =
		(type: "avatar" | "header") => (event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) return;
			uploadMutation.mutate({ type, file });
			event.target.value = "";
		};

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Profile</h2>
				<p className="text-muted-foreground text-sm">
					Your personal information
				</p>
			</div>

			<section>
				<div className="mb-6 rounded-2xl border border-border/60 bg-card/50 p-4">
					<div className="flex items-center gap-4">
						{profile ? (
							<UserAvatar
								name={profile.name}
								image={profile.image}
								className="size-16 shrink-0"
								fallbackClassName="text-lg"
							/>
						) : (
							<Skeleton className="size-16 rounded-full" />
						)}
						<div className="min-w-0 flex-1 space-y-1">
							<div>
								<h3 className="font-medium text-sm">Profile photo</h3>
								<p className="text-muted-foreground text-sm">
									Upload a JPG, PNG, or WebP image up to 5MB.
								</p>
							</div>
							<input
								ref={avatarInputRef}
								type="file"
								accept="image/png,image/jpeg,image/webp,image/avif"
								className="hidden"
								onChange={handleFileChange("avatar")}
							/>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => avatarInputRef.current?.click()}
								disabled={!profile || uploadMutation.isPending}
							>
								{uploadMutation.isPending &&
									uploadMutation.variables?.type === "avatar" && (
										<Loader2 className="mr-1.5 size-3.5 animate-spin" />
									)}
								{profile?.image ? "Change photo" : "Upload photo"}
							</Button>
						</div>
					</div>
				</div>

				<div className="mb-6 rounded-2xl border border-border/60 bg-card/50 p-4">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
						{profile ? (
							<div className="relative h-20 w-full shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border/60 sm:w-48">
								{/* @ts-expect-error - The headerImage field is loosely typed returning from TRPC depending on client, assuming string */}
								{profile.headerImage ? (
									<img
										src={profile.headerImage as string}
										alt="Banner"
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
										No banner
									</div>
								)}
							</div>
						) : (
							<Skeleton className="h-20 w-full rounded-md sm:w-48" />
						)}
						<div className="min-w-0 flex-1 space-y-1">
							<div>
								<h3 className="font-medium text-sm">Profile banner</h3>
								<p className="text-muted-foreground text-sm">
									Upload a wide image to show at the top of your profile. Max
									10MB.
								</p>
							</div>
							<input
								ref={headerInputRef}
								type="file"
								accept="image/png,image/jpeg,image/webp,image/avif"
								className="hidden"
								onChange={handleFileChange("header")}
							/>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => headerInputRef.current?.click()}
								disabled={!profile || uploadMutation.isPending}
							>
								{uploadMutation.isPending &&
									uploadMutation.variables?.type === "header" && (
										<Loader2 className="mr-1.5 size-3.5 animate-spin" />
									)}
								{/* @ts-expect-error - see above */}
								{profile?.headerImage ? "Change banner" : "Upload banner"}
							</Button>
						</div>
					</div>
				</div>

				<div className="grid gap-5 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="name">Full name</Label>
						<div className="flex items-center gap-3">
							{profile ? (
								<UserAvatar
									name={profile.name}
									image={profile.image}
									className="size-8 shrink-0"
									fallbackClassName="text-xs"
								/>
							) : (
								<Skeleton className="size-8 rounded-full" />
							)}
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
			</section>

			<Separator />

			<section>
				<h3 className="mb-1 font-semibold text-lg">Bio</h3>
				<p className="mb-4 text-muted-foreground text-sm">
					Tell others a bit about yourself. This is visible on your profile.
				</p>
				{profile ? (
					<div className="space-y-2">
						<Textarea
							value={bio}
							onChange={(e) => setBio(e.target.value)}
							placeholder="Write something about yourself..."
							maxLength={500}
							rows={4}
						/>
						<p className="text-right text-muted-foreground text-xs">
							{bio.length}/500
						</p>
					</div>
				) : (
					<Skeleton className="h-24 w-full" />
				)}
			</section>

			{hasChanges && (
				<div className="flex items-center justify-end gap-3 border-border border-t pt-5">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setName(profile?.name ?? "");
							setBio(profile?.bio ?? "");
						}}
					>
						Discard
					</Button>
					<Button
						size="sm"
						onClick={handleSave}
						disabled={updateMutation.isPending}
					>
						{updateMutation.isPending && (
							<Loader2 className="mr-1.5 size-3.5 animate-spin" />
						)}
						Save changes
					</Button>
				</div>
			)}
		</div>
	);
}
