import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { getApiOrigin } from "@/lib/api-origin";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export function DataBackupsSettings() {
	const queryClient = useQueryClient();
	const [jobId, setJobId] = useState<string>();
	const query = useQuery({
		...orpc.settings.getBackups.queryOptions({ input: { jobId } }),
		refetchInterval: 3000,
	});
	const { data } = query;
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.settings.getBackups.key() });
	const create = useMutation({
		...orpc.settings.createBackup.mutationOptions(),
		onSuccess: (result) => {
			setJobId(result.jobId);
			void invalidate();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
	const remove = useMutation({
		...orpc.settings.deleteBackup.mutationOptions(),
		onSuccess: async () => {
			await invalidate();
			toast.success(m["settings.backups.deleted"]());
		},
		onError: (error) => toast.error(error.message),
	});
	const update = useMutation({
		...orpc.settings.updateBackups.mutationOptions(),
		onSuccess: () => {
			void invalidate();
			toast.success(m["settings.backups.saved"]());
		},
		onError: (error) => toast.error(error.message),
	});
	useEffect(() => {
		if (!jobId || !data?.job) return;
		if (data.job.state === "completed") {
			toast.success(m["settings.backups.created"]());
			setJobId(undefined);
		} else if (data.job.state === "failed") {
			toast.error(data.job.error || m["settings.backups.failed"]());
			setJobId(undefined);
		}
	}, [data?.job, jobId]);
	if (!data)
		return (
			<p role="status">
				{query.isError
					? m["settings.backups.load_error"]()
					: m["settings.backups.loading"]()}
			</p>
		);
	const busy = data.busy || create.isPending || !!jobId;
	const configBusy = update.isPending;
	const selectClass =
		"rounded-md border border-input bg-background px-3 py-2 text-sm";
	return (
		<div className="flex flex-col gap-10">
			<section className="space-y-4">
				<p className="max-w-2xl text-muted-foreground text-sm">
					{m["settings.backups.description"]()}
				</p>
				{!data.available && (
					<p role="alert" className="text-destructive text-sm">
						{m["settings.backups.unavailable"]()}
					</p>
				)}
				<div className="flex flex-wrap gap-3">
					<Button
						disabled={busy || !data.available}
						onClick={() => create.mutate({})}
					>
						{m["settings.backups.create"]()}
					</Button>
				</div>
				{busy && (
					<p role="status" className="text-muted-foreground text-sm">
						{m["settings.backups.running"]()}
					</p>
				)}
				{data.lastError && (
					<p role="alert" className="text-destructive text-sm">
						{data.lastError}
					</p>
				)}
			</section>
			<section className="space-y-4">
				<h3 className="font-semibold text-xl">
					{m["settings.backups.schedule"]()}
				</h3>
				<p className="text-muted-foreground text-sm">
					{m["settings.backups.schedule_description"]()}
				</p>
				<SettingRows>
					<SettingControlRow label={m["settings.backups.frequency"]()}>
						<select
							aria-label={m["settings.backups.frequency"]()}
							className={selectClass}
							value={data.config.frequency}
							disabled={configBusy}
							onChange={(event) =>
								update.mutate({
									...data.config,
									frequency: event.target.value as
										| "disabled"
										| "daily"
										| "weekly",
								})
							}
						>
							<option value="disabled">
								{m["settings.backups.disabled"]()}
							</option>
							<option value="daily" disabled={!data.available}>
								{m["settings.backups.daily"]()}
							</option>
							<option value="weekly" disabled={!data.available}>
								{m["settings.backups.weekly"]()}
							</option>
						</select>
					</SettingControlRow>
					<SettingControlRow label={m["settings.backups.hour"]()}>
						<select
							aria-label={m["settings.backups.hour"]()}
							className={selectClass}
							value={data.config.hour}
							disabled={configBusy}
							onChange={(event) =>
								update.mutate({
									...data.config,
									hour: Number(event.target.value),
								})
							}
						>
							{Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
								<option key={hour} value={hour}>
									{String(hour).padStart(2, "0")}:00 UTC
								</option>
							))}
						</select>
					</SettingControlRow>
					<SettingControlRow
						label={m["settings.backups.retention"]()}
						description={m["settings.backups.retention_description"]()}
					>
						<select
							aria-label={m["settings.backups.retention"]()}
							className={selectClass}
							value={data.config.retention}
							disabled={configBusy}
							onChange={(event) =>
								update.mutate({
									...data.config,
									retention: Number(event.target.value),
								})
							}
						>
							{Array.from({ length: 100 }, (_, index) => index + 1).map(
								(copies) => (
									<option key={copies} value={copies}>
										{copies}
									</option>
								),
							)}
						</select>
					</SettingControlRow>
				</SettingRows>
			</section>
			<section className="space-y-4">
				<h3 className="font-semibold text-xl">
					{m["settings.backups.history"]()}
				</h3>
				{data.files.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{m["settings.backups.empty"]()}
					</p>
				) : (
					<SettingRows>
						{data.files.map((file) => (
							<SettingControlRow
								key={file.filename}
								label={new Date(file.createdAt).toLocaleString()}
								description={`${file.filename} · ${(file.size / 1024 / 1024).toFixed(2)} MB`}
							>
								<div className="flex items-center gap-3">
									<a
										className="text-primary text-sm underline"
										href={`${getApiOrigin()}/backups/${encodeURIComponent(file.filename)}`}
									>
										{m["settings.backups.download"]()}
									</a>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="text-destructive hover:text-destructive"
										disabled={remove.isPending}
										onClick={() => {
											if (
												window.confirm(
													`${m["settings.backups.delete_confirm"]()}\n\n${file.filename}`,
												)
											)
												remove.mutate({ filename: file.filename });
										}}
									>
										{m["settings.backups.delete"]()}
									</Button>
								</div>
							</SettingControlRow>
						))}
					</SettingRows>
				)}
			</section>
		</div>
	);
}
