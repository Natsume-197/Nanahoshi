import { Check, EnvelopeSimple, Prohibit, Ticket } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

type RegistrationPolicy = "invite-only" | "closed";

const POLICY_OPTIONS: {
	value: RegistrationPolicy;
	label: () => string;
	description: () => string;
	icon: ComponentType<{ className?: string }>;
}[] = [
	{
		value: "invite-only",
		label: m["settings.registration.invite_only"],
		description: m["settings.registration.invite_only_desc"],
		icon: Ticket,
	},
	{
		value: "closed",
		label: m["settings.registration.closed"],
		description: m["settings.registration.closed_desc"],
		icon: Prohibit,
	},
];

/** Instance-wide registration policy — rendered only for the app owner. */
export function RegistrationSettings() {
	const { data, isLoading } = useQuery(orpc.registration.get.queryOptions());
	const { data: sso } = useQuery(orpc.setup.ssoStatus.queryOptions());

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.registration.get.queryOptions().queryKey,
		});
		queryClient.invalidateQueries({
			queryKey: orpc.setup.ssoStatus.queryOptions().queryKey,
		});
	};

	const updateMutation = useMutation({
		...orpc.registration.update.mutationOptions(),
		onSuccess: () => {
			invalidate();
			toast.success(m["settings.registration.updated"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const policy = data?.policy ?? "invite-only";
	const methods = data?.methods ?? { email: true, discord: true };
	const busy = isLoading || updateMutation.isPending;

	const setPolicy = (value: RegistrationPolicy) => {
		if (!data) return;
		updateMutation.mutate({ ...data, policy: value });
	};
	const setMethod = (method: "email" | "discord", enabled: boolean) => {
		if (!data) return;
		updateMutation.mutate({
			...data,
			methods: { ...data.methods, [method]: enabled },
		});
	};

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.registration.policy_title"]()}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{m["settings.registration.policy_desc"]()}
					</p>
				</div>

				<SettingRows>
					{POLICY_OPTIONS.map((option) => {
						const selected = policy === option.value;
						return (
							<button
								key={option.value}
								type="button"
								disabled={busy || selected}
								onClick={() => setPolicy(option.value)}
								className={cn(
									"flex w-full items-center gap-4 rounded-xl px-3 py-3.5 text-left transition-colors disabled:cursor-default",
									selected ? "bg-muted" : "hover:bg-muted/60",
								)}
							>
								<div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
									<option.icon className="size-5" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-medium text-foreground text-sm">
										{option.label()}
									</p>
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
						{m["settings.registration.methods_title"]()}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{m["settings.registration.methods_desc"]()}
					</p>
				</div>

				{isLoading ? (
					<SettingRows>
						<div className="flex items-center justify-between py-4">
							<Skeleton className="h-5 w-36" />
							<Skeleton className="h-6 w-11" />
						</div>
					</SettingRows>
				) : (
					<SettingRows>
						<SettingControlRow
							label={
								<h3 className="flex items-center gap-2 font-medium text-base text-foreground">
									<EnvelopeSimple className="size-4.5" />
									{m["settings.registration.method_email"]()}
								</h3>
							}
							description={m["settings.registration.method_email_desc"]()}
						>
							<Switch
								checked={methods.email}
								disabled={busy || policy === "closed"}
								onCheckedChange={(checked) => setMethod("email", checked)}
							/>
						</SettingControlRow>
						{sso?.discord && (
							<SettingControlRow
								label={
									<h3 className="flex items-center gap-2 font-medium text-base text-foreground">
										<DiscordIcon className="size-4.5" />
										{m["settings.registration.method_discord"]()}
									</h3>
								}
								description={m["settings.registration.method_discord_desc"]()}
							>
								<Switch
									checked={methods.discord}
									disabled={busy || policy === "closed"}
									onCheckedChange={(checked) => setMethod("discord", checked)}
								/>
							</SettingControlRow>
						)}
					</SettingRows>
				)}
			</section>
		</div>
	);
}
