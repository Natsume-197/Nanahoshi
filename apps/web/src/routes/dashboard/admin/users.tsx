import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, Shield, ShieldOff, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/admin/users")({
	component: AdminUsers,
});

function AdminUsers() {
	const { data, isLoading } = useQuery(orpc.admin.listUsers.queryOptions());

	const users = data ?? [];

	const invalidateUsers = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.admin.listUsers.queryOptions().queryKey,
		});
	};

	const banMutation = useMutation({
		...orpc.admin.banUser.mutationOptions(),
		onSuccess: () => {
			invalidateUsers();
			toast.success("User banned");
		},
		onError: (err) => toast.error(err.message),
	});

	const unbanMutation = useMutation({
		...orpc.admin.unbanUser.mutationOptions(),
		onSuccess: () => {
			invalidateUsers();
			toast.success("User unbanned");
		},
		onError: (err) => toast.error(err.message),
	});

	const setRoleMutation = useMutation({
		...orpc.admin.setUserRole.mutationOptions(),
		onSuccess: () => {
			invalidateUsers();
			toast.success("User role updated");
		},
		onError: (err) => toast.error(err.message),
	});

	if (isLoading) {
		return <p className="text-muted-foreground text-sm">Loading users...</p>;
	}

	return (
		<div className="space-y-3">
			{users.map((u) => (
				<Card key={u.id}>
					<CardHeader className="border-b">
						<CardTitle className="flex items-center gap-2">
							{u.name}
							{u.role === "admin" && (
								<span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary text-xs">
									admin
								</span>
							)}
							{u.banned && (
								<span className="rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive text-xs">
									banned
								</span>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="mb-3 text-muted-foreground text-sm">{u.email}</p>
						<div className="flex flex-wrap gap-2">
							{u.banned ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => unbanMutation.mutate({ userId: u.id })}
									disabled={unbanMutation.isPending}
								>
									<UserCheck className="mr-1.5 size-4" />
									Unban
								</Button>
							) : (
								<Button
									variant="outline"
									size="sm"
									onClick={() => banMutation.mutate({ userId: u.id })}
									disabled={banMutation.isPending}
								>
									<Ban className="mr-1.5 size-4" />
									Ban
								</Button>
							)}
							{u.role === "admin" ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setRoleMutation.mutate({
											userId: u.id,
											role: "user",
										})
									}
									disabled={setRoleMutation.isPending}
								>
									<ShieldOff className="mr-1.5 size-4" />
									Remove Admin
								</Button>
							) : (
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setRoleMutation.mutate({
											userId: u.id,
											role: "admin",
										})
									}
									disabled={setRoleMutation.isPending}
								>
									<Shield className="mr-1.5 size-4" />
									Make Admin
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			))}

			{users.length === 0 && (
				<p className="text-muted-foreground text-sm">No users found.</p>
			)}
		</div>
	);
}
