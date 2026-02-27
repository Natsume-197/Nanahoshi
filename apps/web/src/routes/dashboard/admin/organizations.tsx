import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronRight,
	Plus,
	Trash2,
	UserMinus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/admin/organizations")({
	component: AdminOrganizations,
});

function AdminOrganizations() {
	const [showCreate, setShowCreate] = useState(false);
	const [newName, setNewName] = useState("");
	const [newSlug, setNewSlug] = useState("");
	const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

	const { data: organizations, isLoading } = useQuery(
		orpc.admin.listOrganizations.queryOptions(),
	);

	const invalidateOrgs = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.admin.listOrganizations.queryOptions().queryKey,
		});
	};

	const createMutation = useMutation({
		...orpc.admin.createOrganization.mutationOptions(),
		onSuccess: () => {
			invalidateOrgs();
			setShowCreate(false);
			setNewName("");
			setNewSlug("");
			toast.success("Organization created");
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.admin.deleteOrganization.mutationOptions(),
		onSuccess: () => {
			invalidateOrgs();
			toast.success("Organization deleted");
		},
		onError: (err) => toast.error(err.message),
	});

	if (isLoading) {
		return (
			<p className="text-muted-foreground text-sm">
				Loading organizations...
			</p>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-lg">Organizations</h2>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setShowCreate(!showCreate)}
				>
					<Plus className="mr-1.5 size-4" />
					New Organization
				</Button>
			</div>

			{showCreate && (
				<Card>
					<CardContent className="pt-4">
						<form
							className="flex flex-col gap-3 sm:flex-row sm:items-end"
							onSubmit={(e) => {
								e.preventDefault();
								createMutation.mutate({
									name: newName,
									slug: newSlug,
								});
							}}
						>
							<Input
								placeholder="Organization name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								required
							/>
							<Input
								placeholder="slug"
								value={newSlug}
								onChange={(e) => setNewSlug(e.target.value)}
								required
							/>
							<div className="flex gap-2">
								<Button
									type="submit"
									size="sm"
									disabled={createMutation.isPending}
								>
									Create
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setShowCreate(false)}
								>
									Cancel
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			)}

			{organizations && organizations.length === 0 && (
				<p className="text-muted-foreground text-sm">
					No organizations yet.
				</p>
			)}

			{organizations?.map((org) => (
				<Card key={org.id}>
					<CardHeader className="border-b">
						<CardTitle className="flex items-center justify-between">
							<button
								type="button"
								className="flex items-center gap-2"
								onClick={() =>
									setExpandedOrg(
										expandedOrg === org.id
											? null
											: org.id,
									)
								}
							>
								{expandedOrg === org.id ? (
									<ChevronDown className="size-4" />
								) : (
									<ChevronRight className="size-4" />
								)}
								{org.name}
								<span className="font-normal text-muted-foreground text-xs">
									{org.slug}
								</span>
							</button>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									deleteMutation.mutate({ orgId: org.id })
								}
								disabled={deleteMutation.isPending}
							>
								<Trash2 className="mr-1.5 size-4" />
								Delete
							</Button>
						</CardTitle>
					</CardHeader>

					{expandedOrg === org.id && (
						<CardContent>
							<OrgMembers orgId={org.id} />
						</CardContent>
					)}
				</Card>
			))}
		</div>
	);
}

function OrgMembers({ orgId }: { orgId: string }) {
	const { data, isLoading } = useQuery(
		orpc.admin.getOrgWithMembers.queryOptions({ input: { orgId } }),
	);

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.admin.getOrgWithMembers.queryOptions({ input: { orgId } })
				.queryKey,
		});
	};

	const removeMutation = useMutation({
		...orpc.admin.removeMember.mutationOptions(),
		onSuccess: () => {
			invalidate();
			toast.success("Member removed");
		},
		onError: (err) => toast.error(err.message),
	});

	const updateRoleMutation = useMutation({
		...orpc.admin.updateMemberRole.mutationOptions(),
		onSuccess: () => {
			invalidate();
			toast.success("Member role updated");
		},
		onError: (err) => toast.error(err.message),
	});

	if (isLoading) {
		return (
			<p className="text-muted-foreground text-sm">Loading members...</p>
		);
	}

	if (!data?.members?.length) {
		return <p className="text-muted-foreground text-sm">No members.</p>;
	}

	return (
		<div className="space-y-2">
			<h3 className="font-medium text-sm">Members</h3>
			{data.members.map((m) => (
				<div
					key={m.id}
					className="flex items-center justify-between rounded-md border p-3"
				>
					<div>
						<p className="font-medium text-sm">{m.userName}</p>
						<p className="text-muted-foreground text-xs">
							{m.userEmail} &middot; {m.role}
						</p>
					</div>
					<div className="flex gap-2">
						<select
							className="rounded border bg-background px-2 py-1 text-sm"
							value={m.role}
							onChange={(e) =>
								updateRoleMutation.mutate({
									memberId: m.id,
									role: e.target.value,
								})
							}
						>
							<option value="member">member</option>
							<option value="admin">admin</option>
							<option value="owner">owner</option>
						</select>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								removeMutation.mutate({ memberId: m.id })
							}
							disabled={removeMutation.isPending}
						>
							<UserMinus className="size-4" />
						</Button>
					</div>
				</div>
			))}
		</div>
	);
}
