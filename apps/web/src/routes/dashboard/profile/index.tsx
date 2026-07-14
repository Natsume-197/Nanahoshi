import {
	BookBookmark,
	BookOpenText,
	Check,
	Clock,
	Pencil,
	TextT,
	X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ActivityFeed } from "@/components/shared/activity-feed";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatReadingTime } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/profile/")({
	component: ProfilePage,
});

const statConfig = {
	1: { text: "text-chart-4", bg: "bg-chart-4/10" },
	2: { text: "text-chart-1", bg: "bg-chart-1/10" },
	3: { text: "text-chart-3", bg: "bg-chart-3/10" },
	4: { text: "text-chart-5", bg: "bg-chart-5/10" },
} as const;

function ProfilePage() {
	const queryClient = useQueryClient();
	const [editingBio, setEditingBio] = useState(false);
	const [bioValue, setBioValue] = useState("");

	const profileQuery = useQuery(orpc.profile.getProfile.queryOptions());
	const statsQuery = useQuery(orpc.profile.getStats.queryOptions());
	const activityQuery = useQuery(
		orpc.profile.getActivityFeed.queryOptions({ input: { limit: 25 } }),
	);

	const updateProfileMutation = useMutation({
		mutationFn: (bio: string) => client.profile.updateProfile({ bio }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getProfile.queryOptions().queryKey,
			});
			setEditingBio(false);
			toast.success("Profile updated");
		},
		onError: () => toast.error("Failed to update profile"),
	});

	const profile = profileQuery.data;
	const stats = statsQuery.data;
	const activities = activityQuery.data;

	const startEditBio = () => {
		setBioValue(profile?.bio ?? "");
		setEditingBio(true);
	};

	const saveBio = () => {
		updateProfileMutation.mutate(bioValue);
	};

	return (
		<div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
			{/* Profile header */}
			<div className="flex items-start gap-5">
				<UserAvatar
					name={profile?.name}
					image={profile?.image}
					className="size-20 shrink-0 drop-shadow-lg"
					fallbackClassName="font-extrabold text-2xl"
				/>
				<div className="min-w-0 flex-1">
					<h1 className="font-bold text-2xl tracking-tight">
						{profile?.name ?? <Skeleton className="h-7 w-40" />}
					</h1>
					<p className="text-muted-foreground text-sm">
						{profile?.email ?? <Skeleton className="h-4 w-52" />}
					</p>
					{profile?.createdAt && (
						<p className="mt-1 text-muted-foreground text-xs">
							Member since{" "}
							{new Date(profile.createdAt).toLocaleDateString(undefined, {
								year: "numeric",
								month: "long",
							})}
						</p>
					)}

					<div className="mt-3">
						{editingBio ? (
							<div className="flex flex-col gap-2">
								<textarea
									value={bioValue}
									onChange={(e) => setBioValue(e.target.value)}
									maxLength={2000}
									rows={3}
									className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
									aria-label="Bio"
									placeholder="Write something about yourself..."
								/>
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										onClick={saveBio}
										disabled={updateProfileMutation.isPending}
									>
										<Check className="mr-1 size-3.5" />
										Save
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setEditingBio(false)}
									>
										<X className="mr-1 size-3.5" />
										Cancel
									</Button>
									<span className="ml-auto text-muted-foreground text-xs">
										{bioValue.length}/2000
									</span>
								</div>
							</div>
						) : (
							<div className="group flex items-start gap-2">
								<p className="whitespace-pre-wrap text-sm">
									{profile?.bio || (
										<span className="text-muted-foreground italic">
											No bio yet
										</span>
									)}
								</p>
								<button
									type="button"
									onClick={startEditBio}
									aria-label="Edit bio"
									className="shrink-0 rounded p-2 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
								>
									<Pencil className="size-3.5" />
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard
					icon={BookOpenText}
					label="Completed"
					value={stats ? String(stats.booksCompleted) : undefined}
					color={1}
				/>
				<StatCard
					icon={BookBookmark}
					label="Reading"
					value={
						stats
							? String(stats.booksStarted - stats.booksCompleted)
							: undefined
					}
					color={2}
				/>
				<StatCard
					icon={Clock}
					label="Read time"
					value={
						stats ? formatReadingTime(stats.totalReadingTimeSeconds) : undefined
					}
					color={3}
				/>
				<StatCard
					icon={TextT}
					label="Characters"
					value={stats ? formatNumber(stats.totalCharsRead) : undefined}
					color={4}
				/>
			</div>

			<div>
				<h2 className="mb-4 font-semibold text-lg">Activity</h2>
				<ActivityFeed
					items={activities}
					isLoading={activityQuery.isLoading}
					emptyState={
						<Card>
							<CardContent className="py-10 text-center text-muted-foreground text-sm">
								No activity yet. Start reading or like a book to see your
								activity here.
							</CardContent>
						</Card>
					}
				/>
			</div>
		</div>
	);
}

function StatCard({
	icon: Icon,
	label,
	value,
	color,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: string | undefined;
	color: keyof typeof statConfig;
}) {
	const colors = statConfig[color];
	return (
		<Card>
			<CardContent className="flex flex-col gap-1.5 p-4">
				<div className="flex items-center gap-2">
					<div
						className={`flex size-7 items-center justify-center rounded-lg ${colors.bg}`}
					>
						<Icon className={`size-3.5 ${colors.text}`} />
					</div>
					<span className="text-muted-foreground text-xs">{label}</span>
				</div>
				{value !== undefined ? (
					<span className="font-extrabold text-2xl tracking-tight">
						{value}
					</span>
				) : (
					<Skeleton className="h-7 w-16" />
				)}
			</CardContent>
		</Card>
	);
}
