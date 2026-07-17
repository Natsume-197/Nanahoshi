import { Check, Globe, Lock, UserPlus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { DiscordAccessRules } from "@/components/settings/sections/discord";
import { SettingRows } from "@/components/settings/setting-rows";
import { Badge } from "@/components/ui/badge";
import { useAbilities } from "@/hooks/use-abilities";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

type AccessMode = "invite_only" | "request" | "discoverable";

const MODE_OPTIONS: {
	value: AccessMode;
	label: () => string;
	description: () => string;
	icon: ComponentType<{ className?: string }>;
	enforced: boolean;
}[] = [
	{
		value: "invite_only",
		label: m["settings.access.invite_only"],
		description: m["settings.access.invite_only_desc"],
		icon: Lock,
		enforced: true,
	},
	{
		value: "request",
		label: m["settings.access.request"],
		description: m["settings.access.request_desc"],
		icon: UserPlus,
		enforced: false,
	},
	{
		value: "discoverable",
		label: m["settings.access.discoverable"],
		description: m["settings.access.discoverable_desc"],
		icon: Globe,
		enforced: false,
	},
];

export function AccessSettings() {
	const { can } = useAbilities();
	const canManage = can("settings", "update");

	const { data, isLoading } = useQuery(
		orpc.serverAccess.getMode.queryOptions(),
	);
	const currentMode: AccessMode = data?.mode ?? "invite_only";

	const setModeMutation = useMutation({
		...orpc.serverAccess.setMode.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.serverAccess.getMode.queryOptions().queryKey,
			});
			toast.success(m["settings.access.updated"]());
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.access.join_title"]()}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{m["settings.access.join_desc"]()}
					</p>
				</div>

				<SettingRows>
					{MODE_OPTIONS.map((option) => {
						const selected = currentMode === option.value;
						const disabled =
							!canManage ||
							!option.enforced ||
							selected ||
							setModeMutation.isPending ||
							isLoading;

						return (
							<button
								key={option.value}
								type="button"
								disabled={disabled}
								onClick={() => setModeMutation.mutate({ mode: option.value })}
								className={cn(
									"flex w-full items-center gap-4 rounded-xl px-3 py-3.5 text-left transition-colors disabled:cursor-default",
									selected ? "bg-muted" : "hover:bg-muted/60",
									!option.enforced && "opacity-60",
								)}
							>
								<div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
									<option.icon className="size-5" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-medium text-foreground text-sm">
											{option.label()}
										</p>
										{!option.enforced && (
											<Badge variant="secondary">
												{m["settings.access.coming_soon"]()}
											</Badge>
										)}
									</div>
									<p className="text-muted-foreground text-sm">
										{option.description()}
									</p>
								</div>
								{selected && (
									<div className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
										<Check className="size-3.5" weight="bold" />
									</div>
								)}
							</button>
						);
					})}
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.access.discord_title"]()}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{m["settings.access.discord_desc"]()}
					</p>
				</div>
				<DiscordAccessRules canManage={canManage} />
			</section>
		</div>
	);
}
