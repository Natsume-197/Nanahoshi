import { useQuery } from "@tanstack/react-query";
import { BookOpen, Books, Users } from "@phosphor-icons/react";
import { ServerBranding } from "@/components/settings/sections/server-branding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

export function ServerGeneral() {
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
				<p className="text-muted-foreground text-sm">
					{m["settings.org.details_desc"]()}
				</p>
			</div>

			{/* Overview card */}
			<Card>
				<CardHeader className="border-b">
					<CardTitle className="text-base">
						{m["settings.org.overview"]()}
					</CardTitle>
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
									{m["settings.org.name"]()}
								</p>
								<p className="mt-0.5 text-foreground text-sm">{org.name}</p>
							</div>
							<div>
								<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									{m["settings.org.slug"]()}
								</p>
								<p className="mt-0.5 text-foreground text-sm">{org.slug}</p>
							</div>
							<div>
								<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									{m["settings.org.created"]()}
								</p>
								<p className="mt-0.5 text-foreground text-sm">
									{new Intl.DateTimeFormat(getLocale()).format(
										new Date(org.createdAt),
									)}
								</p>
							</div>
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							{m["settings.org.none_selected"]()}
						</p>
					)}
				</CardContent>
			</Card>

			{/* Branding — logo + invitation background (settings:update only) */}
			<ServerBranding />

			{/* Stats — only for admins */}
			{session?.user.role === "admin" && (
				<div className="grid gap-4 sm:grid-cols-3">
					{[
						{
							label: m["settings.system.books"](),
							value: stats?.bookCount ?? 0,
							icon: BookOpen,
						},
						{
							label: m["settings.system.libraries"](),
							value: stats?.libraryCount ?? 0,
							icon: Books,
						},
						{
							label: m["settings.org.members"](),
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
