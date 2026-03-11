import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute(
	"/dashboard/settings/organization/discord",
)({
	component: DiscordAccessRules,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		// System admins always pass
		if (session.user.role === "admin") return;

		const orgId = session.session.activeOrganizationId;
		if (!orgId) {
			throw redirect({ to: "/dashboard/settings/organization/general" });
		}

		// Check org membership role
		const { data: org } = await authClient.getFullOrganization({ query: { organizationId: orgId } });
		const myRole = org?.members.find((m) => m.userId === session.user.id)?.role;
		if (myRole !== "admin" && myRole !== "owner") {
			throw redirect({ to: "/dashboard/settings/organization/general" });
		}
	},
});


function DiscordAccessRules() {
	const queryClient = useQueryClient();
	const [guildId, setGuildId] = useState("");
	const [roleId, setRoleId] = useState("");
	const [label, setLabel] = useState("");

	const { data: rules, isLoading } = useQuery(
		orpc.discordRules.list.queryOptions(),
	);

	const createMutation = useMutation({
		...orpc.discordRules.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.discordRules.list.key() });
			setGuildId("");
			setRoleId("");
			setLabel("");
			toast.success("Rule added");
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.discordRules.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.discordRules.list.key() });
			toast.success("Rule removed");
		},
		onError: (err) => toast.error(err.message),
	});

	const toggleMutation = useMutation({
		...orpc.discordRules.toggle.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.discordRules.list.key() });
		},
		onError: (err) => toast.error(err.message),
	});

	const handleAdd = () => {
		if (!guildId.trim()) {
			toast.error("Guild ID is required");
			return;
		}
		createMutation.mutate({
			guildId: guildId.trim(),
			roleId: roleId.trim() || undefined,
			label: label.trim() || undefined,
		});
	};

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Discord Access</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Restrict who can join via invite links based on Discord server
					membership and roles. Direct email invitations bypass these rules.
					If no rules are set, anyone can join.
				</p>
			</div>

			{/* Info box */}
			<div className="flex gap-3 rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/5 p-4 text-sm">
				<ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#5865F2]" />
				<p className="text-muted-foreground">
					Users must satisfy <strong>at least one</strong> rule to join. Each
					rule requires guild membership and optionally a specific role. Users
					must have Discord linked in their account.
				</p>
			</div>

			{/* Existing rules */}
			<section>
				<h3 className="mb-3 font-semibold text-sm">Active Rules</h3>
				<div className="space-y-2">
					{isLoading ? (
						<>
							<Skeleton className="h-16 w-full rounded-lg" />
							<Skeleton className="h-16 w-full rounded-lg" />
						</>
					) : rules?.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No rules configured — access is open.
						</p>
					) : (
						rules?.map((rule) => (
							<div
								key={rule.id}
								className="flex items-center gap-4 rounded-lg border p-4"
							>
								<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#5865F2]/10">
									<DiscordIcon className="size-4 text-[#5865F2]" />
								</div>
								<div className="min-w-0 flex-1">
									{rule.label && (
										<p className="truncate font-medium text-sm">{rule.label}</p>
									)}
									<p className="truncate text-muted-foreground text-xs">
										Guild: <span className="font-mono">{rule.guildId}</span>
										{rule.roleId && (
											<>
												{" "}
												· Role: <span className="font-mono">{rule.roleId}</span>
											</>
										)}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Switch
										checked={rule.enabled}
										onCheckedChange={(checked) =>
											toggleMutation.mutate({ id: rule.id, enabled: checked })
										}
										disabled={toggleMutation.isPending}
									/>
									<Button
										variant="ghost"
										size="icon"
										className="shrink-0 text-muted-foreground hover:text-destructive"
										onClick={() => deleteMutation.mutate({ id: rule.id })}
										disabled={deleteMutation.isPending}
									>
										<Trash2 className="size-4" />
									</Button>
								</div>
							</div>
						))
					)}
				</div>
			</section>

			<Separator />

			{/* Add new rule */}
			<section>
				<h3 className="mb-4 font-semibold text-sm">Add Rule</h3>
				<div className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>
								Guild ID <span className="text-destructive">*</span>
							</Label>
							<Input
								placeholder="e.g. 1234567890123456789"
								value={guildId}
								onChange={(e) => setGuildId(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								Right-click your Discord server → Copy Server ID
							</p>
						</div>
						<div className="space-y-2">
							<Label>
								Role ID{" "}
								<span className="text-muted-foreground">(optional)</span>
							</Label>
							<Input
								placeholder="e.g. 9876543210987654321"
								value={roleId}
								onChange={(e) => setRoleId(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								Leave empty to require only server membership
							</p>
						</div>
					</div>
					<div className="space-y-2">
						<Label>
							Label <span className="text-muted-foreground">(optional)</span>
						</Label>
						<Input
							placeholder="e.g. Members, VIP, Staff..."
							value={label}
							onChange={(e) => setLabel(e.target.value)}
						/>
					</div>
					<Button
						onClick={handleAdd}
						disabled={createMutation.isPending || !guildId.trim()}
					>
						{createMutation.isPending ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<Plus className="mr-2 size-4" />
						)}
						Add Rule
					</Button>
				</div>
			</section>
		</div>
	);
}
