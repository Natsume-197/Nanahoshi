import { createFileRoute } from "@tanstack/react-router";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute(
	"/dashboard/settings/organization/members",
)({
	component: MembersSettings,
});

function MembersSettings() {
	const { data: org, isPending: isLoading } =
		authClient.useActiveOrganization();

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Members</h2>
				<p className="text-muted-foreground text-sm">
					Manage members of your organization
				</p>
			</div>

			{isLoading && (
				<div className="space-y-3">
					<Skeleton className="h-16 w-full rounded-lg" />
					<Skeleton className="h-16 w-full rounded-lg" />
				</div>
			)}

			{!isLoading && !org && (
				<p className="text-muted-foreground text-sm">
					No active organization selected.
				</p>
			)}

			{org?.members && org.members.length > 0 && (
				<div className="space-y-2">
					{org.members.map((member) => (
						<div
							key={member.id}
							className="flex items-center justify-between rounded-lg border border-border/50 p-4"
						>
							<div className="flex items-center gap-3">
								<div className="flex size-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
									{member.user.name?.charAt(0)?.toUpperCase() ?? "?"}
								</div>
								<div>
									<p className="font-medium text-sm">{member.user.name}</p>
									<p className="text-muted-foreground text-xs">
										{member.user.email} &middot;{" "}
										<span className="capitalize">{member.role}</span>
									</p>
								</div>
							</div>

							{member.role !== "owner" && (
								<Button
									variant="outline"
									size="sm"
									onClick={async () => {
										try {
											await authClient.organization.removeMember({
												memberIdOrEmail: member.id,
											});
											toast.success("Member removed");
										} catch {
											toast.error("Failed to remove member");
										}
									}}
								>
									<UserMinus className="size-4" />
								</Button>
							)}
						</div>
					))}
				</div>
			)}

			{org?.members && org.members.length === 0 && (
				<p className="text-muted-foreground text-sm">
					No members in this organization.
				</p>
			)}
		</div>
	);
}
