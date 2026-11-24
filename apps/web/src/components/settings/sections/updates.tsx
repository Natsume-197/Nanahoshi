import type { UpdateStatus } from "@nanahoshi/api/routers/updates/update.model";
import { Button } from "@nanahoshi/ui/components/button";
import { Switch } from "@nanahoshi/ui/components/switch";
import {
	ArrowCircleUp,
	ArrowSquareOut,
	ArrowsClockwise,
	CheckCircle,
	CircleNotch,
	Info,
	Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { useUpdateEvents } from "@/features/updates/use-updates";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc, queryClient } from "@/utils/orpc";

function formatTime(value: string) {
	return new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function blockMessage(status: UpdateStatus): string | null {
	switch (status.installBlock) {
		case "updater-absent":
			return m["updates.block_updater_absent"]();
		case "updater-stale":
			return m["updates.block_updater_stale"]();
		case "updater-incompatible":
			return m["updates.block_updater_incompatible"]();
		case "updater-problem":
			return m["updates.block_updater_problem"]({
				problem: status.updater.problem ?? "",
			});
		case "pinned":
			return m["updates.block_pinned"]({ image: status.updater.image ?? "" });
		default:
			return null;
	}
}

function phaseMessage(status: UpdateStatus): string | null {
	const { phase, progress } = status.updater;
	if (phase === "pulling") {
		return progress && progress.totalBytes > 0
			? m["updates.downloading"]({
					percent: Math.min(
						100,
						Math.round((progress.completedBytes / progress.totalBytes) * 100),
					),
				})
			: m["updates.downloading_plain"]();
	}
	if (phase === "stopping") return m["updates.phase_stopping"]();
	if (phase === "recreating") return m["updates.phase_recreating"]();
	if (phase === "verifying") return m["updates.phase_verifying"]();
	return null;
}

const REASON_LABEL = {
	tasks: () => m["updates.reason_tasks"](),
	listening: () => m["updates.reason_listening"](),
	backup: () => m["updates.reason_backup"](),
} as const;

const RESULT_LABEL = {
	ok: () => m["updates.op_ok"](),
	failed: () => m["updates.op_failed"](),
	"up-to-date": () => m["updates.op_up_to_date"](),
	running: () => m["updates.op_running"](),
} as const;

export function UpdatesSettings() {
	useUpdateEvents();
	const query = useQuery({
		...orpc.updates.status.queryOptions(),
		// Follow a download or install closely while one runs.
		refetchInterval: (q) =>
			q.state.data && q.state.data.updater.phase !== "idle" ? 3_000 : 60_000,
	});
	const setStatus = (status: UpdateStatus) =>
		queryClient.setQueryData(orpc.updates.status.queryKey(), status);
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.updates.key() });

	const check = useMutation({
		...orpc.updates.check.mutationOptions(),
		onSuccess: setStatus,
		onError: (error) => toast.error(error.message),
	});
	const download = useMutation({
		...orpc.updates.download.mutationOptions(),
		onSuccess: () => {
			toast.success(m["updates.toast_download"]());
			void invalidate();
		},
		onError: (error) => toast.error(error.message),
	});
	const install = useMutation({
		...orpc.updates.install.mutationOptions(),
		onSuccess: (status, input) => {
			setStatus(status);
			void invalidate();
			toast.success(
				input.when === "now"
					? m["updates.toast_installing"]()
					: m["updates.toast_scheduled"](),
			);
		},
		onError: (error) => toast.error(error.message),
	});
	const cancel = useMutation({
		...orpc.updates.cancel.mutationOptions(),
		onSuccess: (status) => {
			setStatus(status);
			void invalidate();
			toast.success(m["updates.toast_cancelled"]());
		},
		onError: (error) => toast.error(error.message),
	});
	const preferences = useMutation({
		...orpc.updates.setPreferences.mutationOptions(),
		onSuccess: setStatus,
		onError: (error) => toast.error(error.message),
	});

	const status = query.data;
	if (!status) {
		return (
			<p role="status" className="text-muted-foreground text-sm">
				{query.isError ? m["updates.load_error"]() : null}
			</p>
		);
	}

	const block = blockMessage(status);
	const phase = phaseMessage(status);
	const schedule = status.schedule;
	const available = status.available;
	const stagedNewer =
		status.updater.stagedVersion !== null &&
		status.updater.stagedVersion === available?.version;
	const canInstall = status.installBlock === null && !schedule;
	const working =
		install.isPending || cancel.isPending || status.updater.phase !== "idle";

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<p className="max-w-2xl text-pretty text-muted-foreground text-sm">
					{m["updates.description"]()}
				</p>

				<div className="flex flex-col gap-4 rounded-xl border border-border p-5">
					<div className="flex items-start gap-3">
						{status.development ? (
							<Info aria-hidden="true" className="mt-0.5 size-5 text-info" />
						) : available ? (
							<ArrowCircleUp
								aria-hidden="true"
								className="mt-0.5 size-5 text-info"
							/>
						) : (
							<CheckCircle
								aria-hidden="true"
								className="mt-0.5 size-5 text-success"
							/>
						)}
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<p className="font-medium text-base text-foreground">
								{status.development
									? m["updates.development"]()
									: available
										? m["updates.available"]({ version: available.version })
										: m["updates.up_to_date"]({ version: status.release })}
							</p>
							{status.checkEnabled && !status.development && (
								<p className="text-muted-foreground text-sm">
									{status.check.checkedAt
										? m["updates.checked_at"]({
												time: formatTime(status.check.checkedAt),
											})
										: m["updates.never_checked"]()}
								</p>
							)}
							{status.check.error && (
								<p className="text-destructive text-sm" role="alert">
									{m["updates.check_failed"]({ error: status.check.error })}
								</p>
							)}
							{!status.checkEnabled && (
								<p className="text-muted-foreground text-sm">
									{m["updates.check_disabled"]()}
								</p>
							)}
						</div>
						{status.checkEnabled && !status.development && (
							<Button
								variant="outline"
								size="sm"
								disabled={check.isPending}
								onClick={() => check.mutate({})}
							>
								<ArrowsClockwise
									data-icon="inline-start"
									aria-hidden="true"
									className={check.isPending ? "animate-spin" : undefined}
								/>
								{m["updates.check_now"]()}
							</Button>
						)}
					</div>

					{phase && (
						<p
							role="status"
							className="flex items-center gap-2 text-foreground text-sm"
						>
							<CircleNotch aria-hidden="true" className="size-4 animate-spin" />
							{phase}
						</p>
					)}

					{schedule && (
						<div className="flex flex-col gap-1 rounded-lg bg-warning/10 p-3 text-sm">
							<p className="font-medium text-foreground">
								{schedule.sentAt
									? m["updates.scheduled_sent"]()
									: m["updates.scheduled_idle"]()}
							</p>
							{!schedule.sentAt && status.busy.length > 0 && (
								<p className="text-muted-foreground">
									{m["updates.waiting_for"]({
										reasons: status.busy
											.map((reason) => REASON_LABEL[reason]())
											.join(", "),
									})}
								</p>
							)}
						</div>
					)}

					{block && !status.development && (
						<p className="flex items-start gap-2 text-muted-foreground text-sm">
							<Warning
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0 text-warning"
							/>
							<span className="min-w-0 break-words">{block}</span>
						</p>
					)}

					{stagedNewer && !schedule && available && (
						<p className="text-muted-foreground text-sm">
							{m["updates.downloaded"]({ version: available.version })}
						</p>
					)}

					{!status.development && (canInstall || schedule) && (
						<div className="flex flex-col gap-3">
							<p className="max-w-2xl text-muted-foreground text-sm">
								{m["updates.install_desc"]()}
							</p>
							<div className="flex flex-wrap gap-2">
								{schedule && !schedule.sentAt ? (
									<Button
										variant="outline"
										disabled={cancel.isPending}
										onClick={() => cancel.mutate({})}
									>
										{m["updates.cancel"]()}
									</Button>
								) : (
									canInstall && (
										<>
											<Button
												disabled={working}
												onClick={() => install.mutate({ when: "now" })}
											>
												{m["updates.install_now"]()}
											</Button>
											<Button
												variant="outline"
												disabled={working}
												onClick={() => install.mutate({ when: "idle" })}
											>
												{m["updates.install_idle"]()}
											</Button>
											{available &&
												!stagedNewer &&
												!status.preferences.autoDownload && (
													<Button
														variant="ghost"
														disabled={working || download.isPending}
														onClick={() => download.mutate({})}
													>
														{m["updates.download"]()}
													</Button>
												)}
										</>
									)
								)}
							</div>
						</div>
					)}
				</div>

				<SettingRows>
					<SettingRow
						label={m["updates.running"]()}
						value={status.development ? "development" : status.release}
					/>
					{status.updater.lastOperation && (
						<SettingRow
							label={m["updates.last_operation"]()}
							value={
								<span className="flex flex-col items-end gap-0.5 text-end">
									<span>
										{RESULT_LABEL[status.updater.lastOperation.result]()}
										{" · "}
										{formatTime(status.updater.lastOperation.startedAt)}
									</span>
									{status.updater.lastOperation.message && (
										<span className="max-w-md text-muted-foreground text-xs">
											{status.updater.lastOperation.message}
										</span>
									)}
								</span>
							}
						/>
					)}
				</SettingRows>
			</section>

			{status.updater.state === "connected" && !status.updater.pinned && (
				<section className="flex flex-col gap-2">
					<SettingControlRow
						label={
							<h3 className="font-medium text-base text-foreground">
								{m["updates.auto_download"]()}
							</h3>
						}
						description={m["updates.auto_download_desc"]()}
					>
						<Switch
							checked={status.preferences.autoDownload}
							disabled={preferences.isPending}
							onCheckedChange={(checked) =>
								preferences.mutate({ autoDownload: checked })
							}
						/>
					</SettingControlRow>
					<SettingControlRow
						label={
							<h3 className="font-medium text-base text-foreground">
								{m["updates.auto_install"]()}
							</h3>
						}
						description={m["updates.auto_install_desc"]()}
					>
						<Switch
							checked={status.preferences.autoInstall}
							disabled={preferences.isPending}
							onCheckedChange={(checked) =>
								preferences.mutate({ autoInstall: checked })
							}
						/>
					</SettingControlRow>
				</section>
			)}

			{status.check.newer.length > 0 && (
				<section className="flex flex-col gap-6">
					<h2 className="font-semibold text-foreground text-xl">
						{m["updates.newer_releases"]()}
					</h2>
					{status.check.newer.map((release) => (
						<article
							key={release.version}
							className="flex flex-col gap-3 rounded-xl border border-border p-5"
						>
							<header className="flex flex-wrap items-baseline justify-between gap-2">
								<h3 className="font-medium text-base text-foreground">
									{m["updates.release_notes"]({ version: release.version })}
								</h3>
								<a
									href={release.url}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:underline"
								>
									{m["updates.view_on_github"]()}
									<ArrowSquareOut aria-hidden="true" className="size-3.5" />
								</a>
							</header>
							{release.notes && (
								<div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-foreground/90 text-sm leading-relaxed">
									{release.notes}
								</div>
							)}
						</article>
					))}
				</section>
			)}
		</div>
	);
}
