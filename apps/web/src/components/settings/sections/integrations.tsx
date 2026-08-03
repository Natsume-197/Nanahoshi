import { ArrowSquareOut } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

export function IntegrationsSettings() {
	const { data: status, isLoading } = useQuery(
		orpc.profile.getBookmeterStatus.queryOptions(),
	);
	const [bookmeterInput, setBookmeterInput] = useState("");

	const invalidateStatus = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.profile.getBookmeterStatus.queryOptions().queryKey,
		});

	const linkMutation = useMutation({
		mutationFn: (bookmeter: string) =>
			client.profile.linkBookmeter({ bookmeter }),
		onSuccess: () => {
			toast.success(m["settings.integrations.bookmeter_linked"]());
			setBookmeterInput("");
			invalidateStatus();
		},
		onError: (err) =>
			toast.error(
				getErrorMessage(
					err,
					m["settings.integrations.bookmeter_link_failed"](),
				),
			),
	});

	const unlinkMutation = useMutation({
		mutationFn: () => client.profile.unlinkBookmeter(),
		onSuccess: () => {
			toast.success(m["settings.integrations.bookmeter_unlinked"]());
			invalidateStatus();
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.integrations.error"]())),
	});

	const syncMutation = useMutation({
		mutationFn: () => client.profile.syncBookmeterNow(),
		onSuccess: () => {
			toast.success(m["settings.integrations.bookmeter_sync_queued"]());
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.integrations.error"]())),
	});

	const linked = Boolean(status?.bookmeterUserId);
	const lastSynced = status?.lastSyncedAt
		? new Intl.DateTimeFormat(getLocale(), {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(new Date(status.lastSyncedAt))
		: m["settings.integrations.bookmeter_never_synced"]();

	return (
		<div className="flex flex-col gap-8">
			<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
				{m["settings.integrations.desc"]()}
			</p>

			<SettingRows>
				<SettingControlRow
					label={
						<h3 className="font-medium text-base text-foreground">
							{m["settings.integrations.bookmeter_title"]()}
						</h3>
					}
					description={
						linked ? (
							<>
								{m["settings.integrations.bookmeter_synced_desc"]({
									lastSynced,
								})}
								{status?.lastSyncResult && (
									<span className="mt-1 block">
										{m["settings.integrations.bookmeter_last_result"]({
											fetched: status.lastSyncResult.fetched,
											matched: status.lastSyncResult.matched,
											added: status.lastSyncResult.added,
										})}
									</span>
								)}
							</>
						) : (
							m["settings.integrations.bookmeter_desc"]()
						)
					}
					controlClassName="sm:max-w-md"
				>
					{isLoading ? (
						<Skeleton className="h-9 w-64" />
					) : linked ? (
						<div className="flex flex-wrap items-center gap-2">
							<a
								href={`https://bookmeter.com/users/${status?.bookmeterUserId}`}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 font-medium text-foreground text-sm hover:underline"
							>
								{m["settings.integrations.bookmeter_linked_as"]({
									id: status?.bookmeterUserId ?? "",
								})}
								<ArrowSquareOut className="size-3.5" />
							</a>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => syncMutation.mutate()}
								disabled={syncMutation.isPending}
							>
								{m["settings.integrations.bookmeter_sync_now"]()}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => unlinkMutation.mutate()}
								disabled={unlinkMutation.isPending}
							>
								{m["settings.integrations.bookmeter_unlink"]()}
							</Button>
						</div>
					) : (
						<form
							className="flex w-full items-center gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								if (bookmeterInput.trim()) {
									linkMutation.mutate(bookmeterInput.trim());
								}
							}}
						>
							<Input
								value={bookmeterInput}
								onChange={(event) => setBookmeterInput(event.target.value)}
								placeholder={m["settings.integrations.bookmeter_placeholder"]()}
								aria-label={m["settings.integrations.bookmeter_title"]()}
							/>
							<Button
								type="submit"
								size="sm"
								disabled={linkMutation.isPending || !bookmeterInput.trim()}
							>
								{m["settings.integrations.bookmeter_link"]()}
							</Button>
						</form>
					)}
				</SettingControlRow>
			</SettingRows>
		</div>
	);
}
