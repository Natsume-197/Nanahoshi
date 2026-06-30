import { useMutation, useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	Database,
	Globe,
	Loader2,
	Save,
	ShoppingCart,
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
import { AMAZON_DOMAINS } from "@/lib/amazon-domains";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

// Per-organization metadata-source config. Tenant-scoped because the Amazon
// cookie is a credential and the store/toggle follow the organization, not the
// whole instance. The shared RanobeDB dump import stays in app-owner settings.
export function MetadataOrgSettings() {
	return (
		<div className="space-y-8">
			<div>
				<p className="text-muted-foreground text-sm">
					Configure metadata sources used to enrich this organization's books.
				</p>
			</div>
			<AmazonCard />
			<RanobedbCard />
		</div>
	);
}

function AmazonCard() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getAmazon.queryOptions(),
	);

	const [domain, setDomain] = useState("co.jp");
	const [enabled, setEnabled] = useState(true);
	const [cookie, setCookie] = useState("");
	const prevConfigRef = useRef(config);

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

	return (
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
							When enabled, Nanahoshi searches Amazon for additional metadata
							after extracting local EPUB data: descriptions, series info, page
							count, ratings, genres, and high-quality covers. This is the
							default store; individual libraries can override it.
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
								The default regional store for this organization's libraries.
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
								your browser session cookie here. It's stored only for this
								organization.
							</p>
						</div>

						<div className="flex items-center justify-end pt-2">
							<Button
								onClick={() =>
									updateMutation.mutate({
										domain,
										enabled,
										cookie: cookie || undefined,
									})
								}
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
	);
}

function RanobedbCard() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getRanobedb.queryOptions(),
	);

	const updateMutation = useMutation({
		mutationFn: (data: { enabled?: boolean }) =>
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

	const enabled = config?.enabled ?? true;

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
					<Skeleton className="h-8 w-full rounded" />
				) : (
					<div className="space-y-4">
						<p className="text-muted-foreground text-sm">
							RanobeDB resolves titles, series, authors, publishers, ISBNs and
							ASINs from a locally imported dump — instantly and without rate
							limits. Per-volume ratings are fetched from the live API (toggle
							per library).
						</p>

						{config && !config.dbReady && (
							<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-600 text-sm dark:text-amber-400">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" />
								<span>
									The shared RanobeDB dump hasn't been imported yet. Ask an app
									administrator to run the import from System settings.
								</span>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
