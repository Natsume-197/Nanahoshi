import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleNotch, Plus, ShieldCheck, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export function DiscordAccessRules() {
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

	const handleAdd = () => {
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
		<div className="space-y-8">
			<div>
				<p className="mt-1 text-muted-foreground text-sm">
					{m["settings.discord.desc"]()}
				</p>
			</div>

			{/* Info box */}
			<div className="flex gap-3 rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/5 p-4 text-sm">
				<ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#5865F2]" />
				<p className="text-muted-foreground">
					{m["settings.discord.rule_hint"]()}
				</p>
			</div>

			{/* Existing rules */}
			<section>
				<h3 className="mb-3 font-semibold text-sm">
					{m["settings.discord.active_rules"]()}
				</h3>
				<div className="space-y-2">
					{isLoading ? (
						<>
							<Skeleton className="h-16 w-full rounded-lg" />
							<Skeleton className="h-16 w-full rounded-lg" />
						</>
					) : rules?.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{m["settings.discord.none"]()}
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
										{m["settings.discord.guild"]()}:{" "}
										<span className="font-mono">{rule.guildId}</span>
										{rule.roleId && (
											<>
												{" "}
												· {m["settings.discord.role"]()}:{" "}
												<span className="font-mono">{rule.roleId}</span>
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
										<Trash className="size-4" />
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
				<h3 className="mb-4 font-semibold text-sm">
					{m["settings.discord.add_rule"]()}
				</h3>
				<div className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>
								{m["settings.discord.guild_id"]()}{" "}
								<span className="text-destructive">*</span>
							</Label>
							<Input
								placeholder="e.g. 1234567890123456789"
								value={guildId}
								onChange={(e) => setGuildId(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								{m["settings.discord.guild_help"]()}
							</p>
						</div>
						<div className="space-y-2">
							<Label>
								{m["settings.discord.role_id"]()}{" "}
								<span className="text-muted-foreground">
									{m["settings.discord.optional"]()}
								</span>
							</Label>
							<Input
								placeholder="e.g. 9876543210987654321"
								value={roleId}
								onChange={(e) => setRoleId(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								{m["settings.discord.role_help"]()}
							</p>
						</div>
					</div>
					<div className="space-y-2">
						<Label>
							{m["settings.discord.label"]()}{" "}
							<span className="text-muted-foreground">
								{m["settings.discord.optional"]()}
							</span>
						</Label>
						<Input
							placeholder={m["settings.discord.label_placeholder"]()}
							value={label}
							onChange={(e) => setLabel(e.target.value)}
						/>
					</div>
					<Button
						onClick={handleAdd}
						disabled={createMutation.isPending || !guildId.trim()}
					>
						{createMutation.isPending ? (
							<CircleNotch className="mr-2 size-4 animate-spin" />
						) : (
							<Plus className="mr-2 size-4" />
						)}
						{m["settings.discord.add_rule"]()}
					</Button>
				</div>
			</section>
		</div>
	);
}
