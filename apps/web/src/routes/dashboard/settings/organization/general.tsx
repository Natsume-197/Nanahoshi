import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { BookOpen, Library, Loader2, LogOut, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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

	const myMember = org?.members.find((m) => m.userId === session?.user?.id);
	const isOwner = myMember?.role === "owner";

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

			{/* Leave organization — only for non-owner members */}
			{org && !isOwner && <LeaveOrganizationCard orgId={org.id} orgName={org.name} />}
		</div>
	);
}

function LeaveOrganizationCard({
	orgId,
	orgName,
}: { orgId: string; orgName: string }) {
	const qc = useQueryClient();
	const router = useRouter();
	const navigate = useNavigate();
	const [isLeaving, setIsLeaving] = useState(false);

	const handleLeave = async () => {
		setIsLeaving(true);
		try {
			const { error } = await authClient.organization.leave({
				organizationId: orgId,
			});
			if (error) {
				toast.error(error.message ?? "Failed to leave organization");
				setIsLeaving(false);
				return;
			}
			toast.success(`You have left ${orgName}`);
			qc.removeQueries({ queryKey: ["auth", "session"] });
			qc.clear();
			await router.invalidate();
			navigate({ to: "/dashboard" });
		} catch {
			toast.error("Failed to leave organization");
			setIsLeaving(false);
		}
	};

	return (
		<Card className="border-destructive/30">
			<CardHeader className="border-b border-destructive/30">
				<CardTitle className="text-base text-destructive">
					Leave Organization
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="mb-4 text-muted-foreground text-sm">
					You will lose access to all libraries and books in this organization.
					You can rejoin later if you receive a new invitation.
				</p>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive" size="sm" disabled={isLeaving}>
							{isLeaving ? (
								<Loader2 className="mr-2 size-4 animate-spin" />
							) : (
								<LogOut className="mr-2 size-4" />
							)}
							Leave Organization
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Leave {orgName}?</AlertDialogTitle>
							<AlertDialogDescription>
								You will lose access to all libraries and books in this
								organization. This action cannot be undone unless you are
								invited again.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={handleLeave}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								Leave
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
}
