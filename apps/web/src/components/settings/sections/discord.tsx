import { CircleNotch, Plus, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export function DiscordAccessRules({ canManage }: { canManage: boolean }) {
	const queryClient = useQueryClient();
	const [addOpen, setAddOpen] = useState(false);
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
			setAddOpen(false);
			toast.success(m["toast.discord_rule_added"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.discordRules.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.discordRules.list.key() });
			toast.success(m["toast.discord_rule_removed"]());
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

	const openAddRule = () => {
		setGuildId("");
		setRoleId("");
		setLabel("");
		setAddOpen(true);
	};

	const addRule = () => {
		if (!guildId.trim()) {
			toast.error(m["settings.discord.guild_required"]());
			return;
		}
		createMutation.mutate({
			guildId: guildId.trim(),
			roleId: roleId.trim() || undefined,
			label: label.trim() || undefined,
		});
	};

	return (
		<>
			<div className="flex flex-col gap-5">
				<div className="flex items-start justify-between gap-6">
					<div className="flex min-w-0 items-start gap-3">
						<div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
							<DiscordIcon className="size-5" />
						</div>
						<div className="flex min-w-0 flex-col gap-1">
							<h3 className="font-medium text-base text-foreground">
								{m["settings.discord.requirements_title"]()}
							</h3>
							<p className="max-w-xl text-muted-foreground text-sm">
								{m["settings.discord.rule_hint"]()}
							</p>
						</div>
					</div>
					{canManage && (rules?.length ?? 0) > 0 && (
						<Button
							variant="outline"
							size="sm"
							className="shrink-0"
							onClick={openAddRule}
						>
							<Plus data-icon="inline-start" />
							{m["settings.discord.add_rule"]()}
						</Button>
					)}
				</div>

				{isLoading ? (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-16 w-full rounded-xl" />
						<Skeleton className="h-16 w-full rounded-xl" />
					</div>
				) : (rules?.length ?? 0) === 0 ? (
					<EmptyState
						title={m["settings.discord.none_title"]()}
						description={m["settings.discord.none"]()}
					>
						{canManage && (
							<Button variant="outline" size="sm" onClick={openAddRule}>
								<Plus data-icon="inline-start" />
								{m["settings.discord.add_rule"]()}
							</Button>
						)}
					</EmptyState>
				) : (
					<ul className="flex flex-col">
						{rules?.map((rule, index) => (
							<li key={rule.id}>
								<div className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-muted/60">
									<div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
										<DiscordIcon className="size-4" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<p className="truncate font-medium text-foreground text-sm">
												{rule.label || m["settings.discord.rule_fallback"]()}
											</p>
											<Badge variant={rule.enabled ? "secondary" : "outline"}>
												{rule.enabled
													? m["settings.discord.enabled"]()
													: m["settings.discord.disabled"]()}
											</Badge>
										</div>
										<p className="truncate text-muted-foreground text-xs">
											{m["settings.discord.guild"]()}: {rule.guildId}
											{" · "}
											{rule.roleId
												? `${m["settings.discord.role"]()}: ${rule.roleId}`
												: m["settings.discord.all_members"]()}
										</p>
									</div>
									<Switch
										size="sm"
										checked={rule.enabled}
										onCheckedChange={(checked) =>
											toggleMutation.mutate({ id: rule.id, enabled: checked })
										}
										disabled={!canManage || toggleMutation.isPending}
										aria-label={m["settings.discord.toggle_rule"]({
											name: rule.label || m["settings.discord.rule_fallback"](),
										})}
									/>
									{canManage && (
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => deleteMutation.mutate({ id: rule.id })}
											disabled={deleteMutation.isPending}
											aria-label={m["settings.discord.delete_rule"]()}
										>
											<Trash />
										</Button>
									)}
								</div>
								{index < (rules?.length ?? 0) - 1 && (
									<Separator className="bg-border/60" />
								)}
							</li>
						))}
					</ul>
				)}
			</div>

			<Modal
				open={addOpen}
				onOpenChange={setAddOpen}
				title={m["settings.discord.add_rule"]()}
				description={m["settings.discord.add_rule_desc"]()}
				onSubmit={(event) => {
					event.preventDefault();
					addRule();
				}}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={createMutation.isPending}
							onClick={() => setAddOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={createMutation.isPending || !guildId.trim()}
						>
							{createMutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : (
								<Plus data-icon="inline-start" />
							)}
							{m["settings.discord.add_rule"]()}
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="discord-rule-label">
							{m["settings.discord.label"]()}
						</Label>
						<Input
							id="discord-rule-label"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							placeholder={m["settings.discord.label_placeholder"]()}
						/>
						<p className="text-muted-foreground text-xs">
							{m["settings.discord.label_help"]()}
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="discord-guild-id">
							{m["settings.discord.guild_id"]()}
						</Label>
						<Input
							id="discord-guild-id"
							inputMode="numeric"
							value={guildId}
							onChange={(event) => setGuildId(event.target.value)}
							placeholder="1234567890123456789"
							required
						/>
						<p className="text-muted-foreground text-xs">
							{m["settings.discord.guild_help"]()}
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="discord-role-id">
							{m["settings.discord.role_id"]()}{" "}
							{m["settings.discord.optional"]()}
						</Label>
						<Input
							id="discord-role-id"
							inputMode="numeric"
							value={roleId}
							onChange={(event) => setRoleId(event.target.value)}
							placeholder="9876543210987654321"
						/>
						<p className="text-muted-foreground text-xs">
							{m["settings.discord.role_help"]()}
						</p>
					</div>
				</div>
			</Modal>
		</>
	);
}
