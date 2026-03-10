import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	BookCheck,
	BookMarked,
	BookOpen,
	Check,
	Clock,
	Heart,
	Pencil,
	Type,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/profile/")({
	component: ProfilePage,
});

function formatRelativeTime(dateStr: string) {
	const now = Date.now();
	const date = new Date(dateStr).getTime();
	const diffMs = now - date;
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return new Date(dateStr).toLocaleDateString();
}

function formatReadingTime(seconds: number) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function formatNumber(n: number) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toString();
}

const activityConfig = {
	started_reading: {
		icon: BookOpen,
		label: "Started reading",
		color: "text-chart-1",
	},
	completed_reading: {
		icon: BookCheck,
		label: "Completed",
		color: "text-chart-4",
	},
	liked_book: {
		icon: Heart,
		label: "Liked",
		color: "text-destructive",
	},
} as const;

const ACTIVITY_SKELETON_IDS = [
	"activity-skeleton-1",
	"activity-skeleton-2",
	"activity-skeleton-3",
	"activity-skeleton-4",
] as const;

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
				{/* Avatar with gradient ring */}
				<div className="shrink-0 rounded-full bg-gradient-to-br from-chart-1 via-primary to-chart-5 p-1 shadow-lg shadow-primary/20">
					<UserAvatar
						name={profile?.name}
						image={profile?.image}
						className="size-20 bg-background"
						fallbackClassName="bg-background font-extrabold text-2xl text-foreground"
					/>
				</div>
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

					{/* Bio */}
					<div className="mt-3">
						{editingBio ? (
							<div className="flex flex-col gap-2">
								<textarea
									value={bioValue}
									onChange={(e) => setBioValue(e.target.value)}
									maxLength={500}
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
										{bioValue.length}/500
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

			{/* Stats grid */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard
					icon={BookCheck}
					label="Completed"
					value={stats ? String(stats.booksCompleted) : undefined}
					color={1}
				/>
				<StatCard
					icon={BookMarked}
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
					icon={Type}
					label="Characters"
					value={stats ? formatNumber(stats.totalCharsRead) : undefined}
					color={4}
				/>
			</div>

			{/* Activity feed */}
			<div>
				<h2 className="mb-4 font-semibold text-lg">Activity</h2>
				{activityQuery.isLoading ? (
					<div className="space-y-3">
						{ACTIVITY_SKELETON_IDS.map((skeletonId) => (
							<Skeleton key={skeletonId} className="h-20 w-full rounded-xl" />
						))}
					</div>
				) : activities && activities.length > 0 ? (
					<div className="space-y-2">
						{activities.map((item) => (
							<ActivityCard key={item.id} activity={item} />
						))}
					</div>
				) : (
					<Card>
						<CardContent className="py-10 text-center text-muted-foreground text-sm">
							No activity yet. Start reading or like a book to see your activity
							here.
						</CardContent>
					</Card>
				)}
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

function ActivityCard({
	activity,
}: {
	activity: {
		id: number;
		type: "started_reading" | "completed_reading" | "liked_book";
		createdAt: string;
		bookUuid: string;
		title: string | null;
		cover: string | null;
	};
}) {
	const config = activityConfig[activity.type];
	const Icon = config.icon;
	const coverFilename = activity.cover?.split("/").pop();
	const displayTitle = activity.title ?? "Untitled";

	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid: activity.bookUuid }}
			className="group flex gap-4 rounded-xl border border-border/50 bg-card p-3 shadow-black/10 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-black/15 hover:shadow-md"
		>
			{/* Cover thumbnail */}
			<div className="h-[80px] w-[54px] shrink-0 overflow-hidden rounded-md bg-muted shadow-black/20 shadow-sm ring-1 ring-white/[0.03]">
				{coverFilename ? (
					<img
						src={getCoverPresetUrl(coverFilename, coverPresets.activity)}
						srcSet={getCoverSrcSet(coverFilename, coverPresets.activity.widths)}
						sizes={coverPresets.activity.sizes}
						alt={displayTitle}
						className="h-full w-full object-cover"
						loading="lazy"
						decoding="async"
						width={108}
						height={160}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
						No cover
					</div>
				)}
			</div>

			{/* Activity info */}
			<div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
				<div className="flex items-center gap-2">
					<Icon className={`size-4 shrink-0 ${config.color}`} />
					<span className="text-muted-foreground text-sm">{config.label}</span>
				</div>
				<p className="line-clamp-1 font-medium text-sm group-hover:text-foreground">
					{displayTitle}
				</p>
			</div>

			{/* Timestamp */}
			<div className="flex shrink-0 items-center">
				<span className="text-muted-foreground text-xs">
					{formatRelativeTime(activity.createdAt)}
				</span>
			</div>
		</Link>
	);
}
