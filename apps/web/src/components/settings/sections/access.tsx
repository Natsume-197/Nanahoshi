import { Check, Globe, Lock, UserPlus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { DiscordAccessRules } from "@/components/settings/sections/discord";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAbilities } from "@/hooks/use-abilities";
import { cn } from "@/lib/utils";
import { orpc, queryClient } from "@/utils/orpc";

type AccessMode = "invite_only" | "request" | "discoverable";

const MODE_OPTIONS: {
	value: AccessMode;
	label: string;
	description: string;
	icon: ComponentType<{ className?: string }>;
	enforced: boolean;
}[] = [
	{
		value: "invite_only",
		label: "Invite only",
		description: "People can only join with an invitation or invite link.",
		icon: Lock,
		enforced: true,
	},
	{
		value: "request",
		label: "Request to join",
		description: "People can request access and an admin approves them.",
		icon: UserPlus,
		enforced: false,
	},
	{
		value: "discoverable",
		label: "Discoverable",
		description: "Anyone on this instance can find and join this server.",
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
			toast.success("Access mode updated");
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<div className="space-y-8">
			<p className="text-muted-foreground text-sm">
				Control who can join this server and under what conditions.
			</p>

			<div className="space-y-2">
				{MODE_OPTIONS.map((opt) => {
					const selected = currentMode === opt.value;
					return (
						<button
							key={opt.value}
							type="button"
							disabled={!canManage || setModeMutation.isPending || isLoading}
							onClick={() => setModeMutation.mutate({ mode: opt.value })}
							className={cn(
								"flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
								selected
									? "border-primary bg-primary/5"
									: "border-border hover:border-foreground/20 hover:bg-accent/40",
							)}
						>
							<opt.icon className="size-5 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="font-medium text-sm">{opt.label}</p>
									{!opt.enforced && (
										<Badge variant="secondary" className="text-[10px]">
											Coming soon
										</Badge>
									)}
								</div>
								<p className="text-muted-foreground text-xs">
									{opt.description}
								</p>
							</div>
							{selected && <Check className="size-4 shrink-0 text-primary" />}
						</button>
					);
				})}
			</div>

			<Separator />

			{/* Discord-based admission restrictions. */}
			<div className="space-y-1">
				<h3 className="font-semibold text-base">Discord restrictions</h3>
			</div>
			<DiscordAccessRules />
		</div>
	);
}
