import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/settings/profile")({
	component: ProfileSettings,
});

function ProfileSettings() {
	const profileQuery = useQuery(orpc.profile.getProfile.queryOptions());
	const profile = profileQuery.data;

	const [name, setName] = useState("");
	const [bio, setBio] = useState("");
	const [hasChanges, setHasChanges] = useState(false);

	useEffect(() => {
		if (profile) {
			setName(profile.name ?? "");
			setBio(profile.bio ?? "");
		}
	}, [profile]);

	useEffect(() => {
		if (!profile) return;
		const nameChanged = name !== (profile.name ?? "");
		const bioChanged = bio !== (profile.bio ?? "");
		setHasChanges(nameChanged || bioChanged);
	}, [name, bio, profile]);

	const updateMutation = useMutation({
		mutationFn: (data: { name?: string; bio?: string }) =>
			client.profile.updateProfile(data),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getProfile.queryOptions().queryKey,
			});
			setHasChanges(false);
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

	const initial = profile?.name?.charAt(0)?.toUpperCase() ?? "?";

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Profile</h2>
				<p className="text-muted-foreground text-sm">
					Your personal information
				</p>
			</div>

			<section>
				<div className="grid gap-5 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="name">Full name</Label>
						<div className="flex items-center gap-3">
							<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
								{initial}
							</div>
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
