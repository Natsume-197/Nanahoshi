import { useMutation, useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	Database,
	DownloadCloud,
	Globe,
	Loader2,
	Play,
	RotateCcw,
	Save,
	ShoppingCart,
	Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

const AMAZON_DOMAINS = [
	{ value: "co.jp", label: "Amazon Japan (co.jp)" },
	{ value: "com", label: "Amazon US (com)" },
	{ value: "co.uk", label: "Amazon UK (co.uk)" },
	{ value: "de", label: "Amazon Germany (de)" },
	{ value: "fr", label: "Amazon France (fr)" },
	{ value: "es", label: "Amazon Spain (es)" },
	{ value: "it", label: "Amazon Italy (it)" },
	{ value: "ca", label: "Amazon Canada (ca)" },
	{ value: "com.au", label: "Amazon Australia (com.au)" },
	{ value: "com.br", label: "Amazon Brazil (com.br)" },
	{ value: "com.mx", label: "Amazon Mexico (com.mx)" },
	{ value: "nl", label: "Amazon Netherlands (nl)" },
	{ value: "se", label: "Amazon Sweden (se)" },
	{ value: "pl", label: "Amazon Poland (pl)" },
] as const;

export function MetadataSourcesSettings() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getAmazon.queryOptions(),
	);

	const [domain, setDomain] = useState("co.jp");
	const [enabled, setEnabled] = useState(true);
	const [cookie, setCookie] = useState("");
	const prevConfigRef = useRef(config);

	// Sync form state when config data loads or changes
	if (config && config !== prevConfigRef.current) {
		prevConfigRef.current = config;
		setDomain(config.domain);
		setEnabled(config.enabled);
		setCookie(config.cookie ?? "");
	}

	const updateMutation = useMutation({
		mutationFn: (data: {
			domain?: string;
			enabled?: boolean;
			cookie?: string;
		}) => client.settings.updateAmazon(data),
		onSuccess: () => {
			toast.success("Amazon configuration updated");
			queryClient.invalidateQueries({
				queryKey: orpc.settings.getAmazon.queryOptions().queryKey,
			});
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to update configuration")),
	});

	const hasChanges =
		config &&
		(domain !== config.domain ||
			enabled !== config.enabled ||
			cookie !== (config.cookie ?? ""));

	function handleSave() {
		updateMutation.mutate({
			domain,
			enabled,
			cookie: cookie || undefined,
		});
	}

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Metadata Sources</h2>
				<p className="text-muted-foreground text-sm">
					Configure external metadata sources for automatic book enrichment
				</p>
			</div>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between border-b">
					<div className="flex items-center gap-2">
						<ShoppingCart className="size-4" />
						<CardTitle>Amazon</CardTitle>
					</div>
					{isLoading ? (
						<Skeleton className="h-[18px] w-8 rounded-full" />
					) : (
						<Switch checked={enabled} onCheckedChange={setEnabled} />
					)}
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
								When enabled, Nanahoshi will search Amazon for additional
								metadata after extracting local EPUB data. This includes
								descriptions, series info, page count, ratings, genres, and
								high-quality covers.
							</p>

							<div className="space-y-2">
								<Label htmlFor="amazon-domain">
									<div className="flex items-center gap-1.5">
										<Globe className="size-3.5" />
										Amazon Domain
									</div>
								</Label>
								<Select value={domain} onValueChange={setDomain}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{AMAZON_DOMAINS.map((d) => (
											<SelectItem key={d.value} value={d.value}>
												{d.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-muted-foreground text-xs">
									Choose the Amazon regional store that best matches your
									library's language
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="amazon-cookie">Cookie (optional)</Label>
								<Input
									id="amazon-cookie"
									type="password"
									value={cookie}
									onChange={(e) => setCookie(e.target.value)}
									placeholder="session-id=...; session-id-time=..."
									disabled={!enabled}
								/>
								<p className="text-muted-foreground text-xs">
									If Amazon blocks requests with CAPTCHAs or 503 errors, paste
									your browser session cookie here. Open Amazon in your browser,
									copy the cookie from DevTools, and paste it above.
								</p>
							</div>

							<div className="flex items-center justify-end pt-2">
								<Button
									onClick={handleSave}
									disabled={updateMutation.isPending || !hasChanges}
									size="sm"
								>
									{updateMutation.isPending ? (
										<Loader2 className="mr-1.5 size-4 animate-spin" />
									) : (
										<Save className="mr-1.5 size-4" />
									)}
									Save changes
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
			<RanobedbCard />
			<EnrichAllCard />
		</div>
	);
}

function RanobedbCard() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getRanobedb.queryOptions(),
	);

	const updateMutation = useMutation({
		mutationFn: (data: { enabled?: boolean; autoUpdate?: boolean }) =>
			client.settings.updateRanobedb(data),
		onSuccess: () => {
			toast.success("RanobeDB configuration updated");
			queryClient.invalidateQueries({
				queryKey: orpc.settings.getRanobedb.queryOptions().queryKey,
			});
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

	const enabled = config?.enabled ?? true;
	const autoUpdate = config?.autoUpdate ?? false;

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between border-b">
				<div className="flex items-center gap-2">
					<Database className="size-4" />
					<CardTitle>RanobeDB</CardTitle>
				</div>
				{isLoading ? (
					<Skeleton className="h-[18px] w-8 rounded-full" />
				) : (
					<Switch
						checked={enabled}
						onCheckedChange={(checked) =>
							updateMutation.mutate({ enabled: checked })
						}
						disabled={updateMutation.isPending}
					/>
				)}
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
							RanobeDB is an open light novel database. Importing its daily dump
							lets Nanahoshi resolve titles, series, authors, publishers, ISBNs
							and Amazon ASINs locally — instantly and without rate limits.
							Amazon is then only consulted for fields RanobeDB doesn't have.
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
			<CardHeader className="flex flex-row items-center justify-between border-b">
				<div className="flex items-center gap-2">
					<Sparkles className="size-4" />
					<CardTitle>Bulk Enrichment</CardTitle>
				</div>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					<p className="text-muted-foreground text-sm">
						Run metadata enrichment from Amazon on all books in your library.
						Books are processed one by one with throttling to avoid rate limits.
						Progress is tracked in the task manager.
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
