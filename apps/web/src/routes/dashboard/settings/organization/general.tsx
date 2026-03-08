import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Library, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute(
	"/dashboard/settings/organization/general",
)({
	component: OrganizationGeneral,
});

function OrganizationGeneral() {
	const { data: session } = authClient.useSession();
	const { data: org, isPending: isOrgLoading } =
		authClient.useActiveOrganization();

	const { data: stats, isLoading: isStatsLoading } = useQuery({
		...orpc.admin.getSystemStats.queryOptions(),
		enabled: session?.user.role === "admin",
	});

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Organization</h2>
				<p className="text-muted-foreground text-sm">
					Manage your organization details and settings
				</p>
			</div>

			{/* Overview card */}
			<Card>
				<CardHeader className="border-b">
					<CardTitle className="text-base">Overview</CardTitle>
				</CardHeader>
				<CardContent>
					{isOrgLoading ? (
						<div className="grid gap-4 sm:grid-cols-2">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : org ? (
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Name
								</p>
								<p className="mt-0.5 text-foreground text-sm">{org.name}</p>
							</div>
							<div>
								<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Slug
								</p>
								<p className="mt-0.5 text-foreground text-sm">{org.slug}</p>
							</div>
							<div>
								<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Created
								</p>
								<p className="mt-0.5 text-foreground text-sm">
									{new Date(org.createdAt).toLocaleDateString()}
								</p>
							</div>
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							No active organization selected.
						</p>
					)}
				</CardContent>
			</Card>

			{/* Stats — only for admins */}
			{session?.user.role === "admin" && (
				<div className="grid gap-4 sm:grid-cols-3">
					{[
						{
							label: "Books",
							value: stats?.bookCount ?? 0,
							icon: BookOpen,
						},
						{
							label: "Libraries",
							value: stats?.libraryCount ?? 0,
							icon: Library,
						},
						{
							label: "Members",
							value: stats?.userCount ?? 0,
							icon: Users,
						},
					].map(({ label, value, icon: Icon }) => (
						<Card key={label}>
							<CardContent className="flex items-center gap-3 pt-4">
								<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
									<Icon className="size-4.5 text-primary" />
								</div>
								<div>
									{isStatsLoading ? (
										<Skeleton className="h-6 w-12 rounded" />
									) : (
										<p className="font-bold text-xl">{value}</p>
									)}
									<p className="text-muted-foreground text-xs">{label}</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
