import {
	ArrowCounterClockwise,
	CircleNotch,
	CloudArrowDown,
	Play,
	Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

// Instance-global metadata maintenance (app-owner). Per-organization sources
// (Amazon, RanobeDB toggle) live in the organization's settings instead — the
// RanobeDB dump is a single shared database, so its import stays here.
export function MetadataSourcesSettings() {
	return (
		<div className="flex flex-col gap-12">
			<RanobedbDumpSection />
			<EnrichAllSection />
		</div>
	);
}

function RanobedbDumpSection() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getRanobedbDump.queryOptions(),
	);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.settings.getRanobedbDump.queryOptions().queryKey,
		});

	const updateMutation = useMutation({
		mutationFn: (data: { autoUpdate?: boolean }) =>
			client.settings.updateRanobedbDump(data),
		onSuccess: () => {
			toast.success("RanobeDB dump configuration updated");
			invalidate();
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to update configuration")),
	});

	const importMutation = useMutation({
		mutationFn: () => client.settings.importRanobedb(),
		onSuccess: (data) => {
			if (data.started) {
				toast.success("RanobeDB import started. Check tasks for progress.");
			} else {
				toast.info("An import is already running.");
			}
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to start import")),
	});

	const autoUpdate = config?.autoUpdate ?? false;

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-foreground text-xl">RanobeDB Dump</h2>
				<p className="text-muted-foreground text-sm">
					This metadata infrastructure is shared by the whole instance;
					per-organization sources are configured in each organization's
					settings. Importing the daily RanobeDB dump lets every organization
					resolve titles, series, authors, publishers, ISBNs and ASINs locally.
				</p>
			</div>
			{isLoading ? (
				<SettingRows>
					<div className="flex items-center justify-between py-4">
						<Skeleton className="h-8 w-52" />
						<Skeleton className="h-8 w-24" />
					</div>
					<div className="flex items-center justify-between py-4">
						<Skeleton className="h-5 w-36" />
						<Skeleton className="h-8 w-24" />
					</div>
				</SettingRows>
			) : (
				<div className="space-y-6">
					{config && !config.psqlAvailable && (
						<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-600 text-sm dark:text-amber-400">
							<Warning className="mt-0.5 size-4 shrink-0" />
							<span>
								<code>psql</code> was not found on the server. Install
								postgresql-client to enable the dump import.
							</span>
						</div>
					)}

					{config?.psqlAvailable && !config.dbReady && (
						<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-600 text-sm dark:text-amber-400">
							<Warning className="mt-0.5 size-4 shrink-0" />
							<span>
								The RanobeDB database hasn't been imported yet. Run the import
								below to enable this provider.
							</span>
						</div>
					)}

					<SettingRows>
						<SettingControlRow
							label={
								<h3 className="font-medium text-base text-foreground">
									Auto-update weekly
								</h3>
							}
							description="Re-import the latest dump every Monday at 3:00 AM"
						>
							<Switch
								checked={autoUpdate}
								onCheckedChange={(checked) =>
									updateMutation.mutate({ autoUpdate: checked })
								}
								disabled={updateMutation.isPending || !config?.psqlAvailable}
							/>
						</SettingControlRow>

						<div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
							<p className="text-muted-foreground text-xs">
								{config?.lastImportedAt
									? `Last imported: ${new Date(config.lastImportedAt).toLocaleString()}`
									: "Never imported"}
							</p>
							<Button
								onClick={() => importMutation.mutate()}
								disabled={importMutation.isPending || !config?.psqlAvailable}
								size="sm"
							>
								{importMutation.isPending ? (
									<CircleNotch className="mr-1.5 size-4 animate-spin" />
								) : (
									<CloudArrowDown className="mr-1.5 size-4" />
								)}
								Import now
							</Button>
						</div>
					</SettingRows>
				</div>
			)}
		</section>
	);
}

function EnrichAllSection() {
	const enrichMutation = useMutation({
		mutationFn: () => client.admin.triggerMetadataEnrich(),
		onSuccess: () => {
			toast.success("Metadata enrichment started. Check tasks for progress.");
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to start enrichment")),
	});

	const retryMutation = useMutation({
		mutationFn: () => client.admin.retryFailedEnrichment(),
		onSuccess: (data) => {
			if (data.count === 0) {
				toast.info("No failed books to retry.");
			} else {
				toast.success(
					`Retrying ${data.count} book(s). Check tasks for progress.`,
				);
			}
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to start retry")),
	});

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-foreground text-xl">
					Bulk Enrichment
				</h2>
				<p className="text-muted-foreground text-sm">
					Run metadata enrichment on all books. Books are processed one by one
					with throttling to avoid rate limits. Progress is tracked in the task
					manager.
				</p>
			</div>
			<div className="flex flex-wrap items-center justify-end gap-2">
				<Button
					onClick={() => retryMutation.mutate()}
					disabled={retryMutation.isPending}
					size="sm"
					variant="outline"
				>
					{retryMutation.isPending ? (
						<CircleNotch className="mr-1.5 size-4 animate-spin" />
					) : (
						<ArrowCounterClockwise className="mr-1.5 size-4" />
					)}
					Retry failed
				</Button>
				<Button
					onClick={() => enrichMutation.mutate()}
					disabled={enrichMutation.isPending}
					size="sm"
				>
					{enrichMutation.isPending ? (
						<CircleNotch className="mr-1.5 size-4 animate-spin" />
					) : (
						<Play className="mr-1.5 size-4" />
					)}
					Enrich all books
				</Button>
			</div>
		</section>
	);
}
