import { useMutation, useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	Database,
	DownloadCloud,
	Loader2,
	Play,
	RotateCcw,
	Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

// Instance-global metadata maintenance (app-owner). Per-organization sources
// (Amazon, RanobeDB toggle) live in the organization's settings instead — the
// RanobeDB dump is a single shared database, so its import stays here.
export function MetadataSourcesSettings() {
	return (
		<div className="space-y-8">
			<div>
				<p className="text-muted-foreground text-sm">
					Shared metadata infrastructure for the whole instance.
					Per-organization sources are configured in each organization's
					settings.
				</p>
			</div>
			<RanobedbDumpCard />
			<EnrichAllCard />
		</div>
	);
}

function RanobedbDumpCard() {
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
		<Card>
			<CardHeader className="flex flex-row items-center gap-2 border-b">
				<Database className="size-4" />
				<CardTitle>RanobeDB Dump</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-4">
						<Skeleton className="h-8 w-full rounded" />
						<Skeleton className="h-8 w-full rounded" />
					</div>
				) : (
					<div className="space-y-6">
						<p className="text-muted-foreground text-sm">
							Importing the daily RanobeDB dump lets every organization resolve
							titles, series, authors, publishers, ISBNs and ASINs locally. The
							dump is shared across the whole instance.
						</p>

						{config && !config.psqlAvailable && (
							<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-600 text-sm dark:text-amber-400">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<span>
									<code>psql</code> was not found on the server. Install
									postgresql-client to enable the dump import.
								</span>
							</div>
						)}

						{config?.psqlAvailable && !config.dbReady && (
							<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-600 text-sm dark:text-amber-400">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<span>
									The RanobeDB database hasn't been imported yet. Run the import
									below to enable this provider.
								</span>
							</div>
						)}

						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-sm">Auto-update weekly</p>
								<p className="text-muted-foreground text-xs">
									Re-import the latest dump every Monday at 3:00 AM
								</p>
							</div>
							<Switch
								checked={autoUpdate}
								onCheckedChange={(checked) =>
									updateMutation.mutate({ autoUpdate: checked })
								}
								disabled={updateMutation.isPending || !config?.psqlAvailable}
							/>
						</div>

						<div className="flex items-center justify-between pt-2">
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
									<Loader2 className="mr-1.5 size-4 animate-spin" />
								) : (
									<DownloadCloud className="mr-1.5 size-4" />
								)}
								Import now
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function EnrichAllCard() {
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
		<Card>
			<CardHeader className="flex flex-row items-center gap-2 border-b">
				<Sparkles className="size-4" />
				<CardTitle>Bulk Enrichment</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					<p className="text-muted-foreground text-sm">
						Run metadata enrichment on all books. Books are processed one by one
						with throttling to avoid rate limits. Progress is tracked in the
						task manager.
					</p>
					<div className="flex items-center justify-end gap-2">
						<Button
							onClick={() => retryMutation.mutate()}
							disabled={retryMutation.isPending}
							size="sm"
							variant="outline"
						>
							{retryMutation.isPending ? (
								<Loader2 className="mr-1.5 size-4 animate-spin" />
							) : (
								<RotateCcw className="mr-1.5 size-4" />
							)}
							Retry failed
						</Button>
						<Button
							onClick={() => enrichMutation.mutate()}
							disabled={enrichMutation.isPending}
							size="sm"
						>
							{enrichMutation.isPending ? (
								<Loader2 className="mr-1.5 size-4 animate-spin" />
							) : (
								<Play className="mr-1.5 size-4" />
							)}
							Enrich all books
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
