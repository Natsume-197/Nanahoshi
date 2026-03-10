import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { CheckCircle, Clock, MailOpen, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard/invitations")({
	component: InvitationsPage,
});

function InvitationsPage() {
	const router = useRouter();

	const { data: invitations, isLoading, refetch } = useQuery({
		queryKey: ["my-invitations"],
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.listInvitations();
			if (error) throw new Error(error.message);
			return data ?? [];
		},
	});

	const handleAccept = async (invitationId: string) => {
		const { error } = await authClient.organization.acceptInvitation({
			invitationId,
		});
		if (error) {
			toast.error("Failed to accept invitation");
			return;
		}
		toast.success("You've joined the organization!");
		refetch();
		router.navigate({ to: "/dashboard" });
	};

	const handleReject = async (invitationId: string) => {
		const { error } = await authClient.organization.rejectInvitation({
			invitationId,
		});
		if (error) {
			toast.error("Failed to reject invitation");
			return;
		}
		toast.success("Invitation rejected");
		refetch();
	};

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">My Invitations</h2>
				<p className="text-muted-foreground text-sm">
					Pending invitations to join organizations
				</p>
			</div>

			{isLoading && (
				<div className="space-y-3">
					<Skeleton className="h-20 w-full rounded-lg" />
					<Skeleton className="h-20 w-full rounded-lg" />
				</div>
			)}

			{!isLoading && (!invitations || invitations.length === 0) && (
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-3 py-12">
						<MailOpen className="size-10 text-muted-foreground/40" />
						<div className="text-center">
							<p className="font-medium text-sm">No pending invitations</p>
							<p className="text-muted-foreground text-xs">
								When someone invites you to an organization, it will appear here.
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			{invitations && invitations.length > 0 && (
				<div className="space-y-3">
					{invitations.map((inv) => {
						const isPending = inv.status === "pending";
						const isExpired =
							inv.expiresAt && new Date(inv.expiresAt) < new Date();

						return (
							<Card key={inv.id}>
								<CardHeader className="pb-2">
									<div className="flex items-center justify-between">
										<CardTitle className="text-base font-semibold">
											{/* @ts-expect-error organization may be populated */}
											{inv.organizationId}
										</CardTitle>
										{isExpired ? (
											<Badge variant="secondary">Expired</Badge>
										) : isPending ? (
											<Badge
												variant="outline"
												className="gap-1 text-amber-600 border-amber-200 bg-amber-50"
											>
												<Clock className="size-3" />
												Pending
											</Badge>
										) : (
											<Badge variant="secondary" className="capitalize">
												{inv.status}
											</Badge>
										)}
									</div>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground text-sm">
										Role:{" "}
										<span className="font-medium capitalize text-foreground">
											{inv.role}
										</span>
									</p>
									{inv.expiresAt && (
										<p className="text-muted-foreground text-xs mt-1">
											Expires {new Date(inv.expiresAt).toLocaleDateString()}
										</p>
									)}

									{isPending && !isExpired && (
										<div className="mt-4 flex gap-2">
											<Button
												size="sm"
												onClick={() => handleAccept(inv.id)}
											>
												<CheckCircle className="mr-2 size-4" />
												Accept
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={() => handleReject(inv.id)}
											>
												<XCircle className="mr-2 size-4" />
												Reject
											</Button>
										</div>
									)}
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}
		</div>
	);
}
