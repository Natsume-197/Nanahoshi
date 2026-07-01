import { useMutation, useQuery } from "@tanstack/react-query";
import {
	BookOpen,
	Building2,
	Database,
	KeyRound,
	Library,
	Loader2,
	Palette,
	Search,
	Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

export function AdminSystem() {
	const { data: stats, isLoading } = useQuery(
		orpc.admin.getSystemStats.queryOptions(),
	);
	const { data: sso } = useQuery(orpc.setup.ssoStatus.queryOptions());

	const reindexMutation = useMutation({
		mutationFn: () => client.admin.triggerBookReindex(),
		onSuccess: () => toast.success(m["toast.book_reindex_started"]()),
		onError: (err) =>
			toast.error(getErrorMessage(err, m["toast.book_reindex_failed"]())),
	});

	const backfillColorsMutation = useMutation({
		mutationFn: () => client.admin.backfillCoverColors(),
		onSuccess: (data) => {
			if (data.enqueued === 0) {
				toast.info(m["toast.cover_colors_already_extracted"]());
			} else {
				toast.success(
					m["toast.cover_color_extraction_started"]({
						count: data.enqueued,
					}),
				);
			}
		},
		onError: (err) =>
			toast.error(
				getErrorMessage(err, m["toast.cover_color_extraction_failed"]()),
			),
	});

	const searchProvider = stats?.searchProvider ?? "pgroonga";
	const isElasticsearch = searchProvider === "elasticsearch";

	const statCards = [
		{
			label: m["settings.system.users"](),
			value: stats?.userCount ?? 0,
			icon: Users,
		},
		{
			label: m["settings.system.servers"](),
			value: stats?.organizationCount ?? 0,
			icon: Building2,
		},
		{
			label: m["settings.system.books"](),
			value: stats?.bookCount ?? 0,
			icon: BookOpen,
		},
		{
			label: m["settings.system.libraries"](),
			value: stats?.libraryCount ?? 0,
			icon: Library,
		},
	];

	return (
		<div className="space-y-8">
			<div>
				<p className="text-muted-foreground text-sm">
					{m["settings.system.desc"]()}
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{statCards.map(({ label, value, icon: Icon }) => (
					<Card key={label}>
						<CardHeader className="flex flex-row items-center justify-between border-b">
							<CardTitle className="font-medium text-sm">{label}</CardTitle>
							<Icon className="size-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							{isLoading ? (
								<Skeleton className="h-8 w-16 rounded" />
							) : (
								<p className="font-bold text-2xl">{value}</p>
							)}
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between border-b">
					<CardTitle>{m["settings.system.search_engine"]()}</CardTitle>
					<Database className="size-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<Skeleton className="h-6 w-32 rounded" />
					) : (
						<div className="flex items-center gap-2">
							<span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-sm">
								{isElasticsearch ? "Elasticsearch" : "PGroonga"}
							</span>
							<span className="text-muted-foreground text-xs">
								{isElasticsearch
									? m["settings.system.search_elasticsearch_desc"]()
									: m["settings.system.search_pgroonga_desc"]()}
							</span>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between border-b">
					<CardTitle>{m["settings.system.sso"]()}</CardTitle>
					<KeyRound className="size-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-2">
						<span
							className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-sm ${
								sso?.enabled
									? "bg-primary/10 text-primary"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{sso?.enabled
								? m["settings.system.enabled"]()
								: m["settings.system.disabled"]()}
						</span>
						<span className="text-muted-foreground text-xs">
							{sso?.enabled
								? m["settings.system.sso_enabled_desc"]({
										label: sso.label,
									})
								: m["settings.system.sso_disabled_desc"]()}
						</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="border-b">
					<CardTitle>{m["settings.system.queue_dashboard"]()}</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="mb-3 text-muted-foreground text-sm">
						{m["settings.system.queue_desc"]()}
					</p>
					<a
						href="/admin/queues/"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
					>
						{m["settings.system.open_bull_board"]()}
					</a>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="border-b">
					<CardTitle>{m["settings.system.maintenance"]()}</CardTitle>
				</CardHeader>
				<CardContent className="divide-y divide-border p-0">
					<div className="flex items-center justify-between px-6 py-4">
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
								<Search className="size-4.5 text-primary" />
							</div>
							<div>
								<p className="font-medium text-sm">
									{m["settings.system.reindex_books"]()}
								</p>
								<p className="text-muted-foreground text-xs">
									{isElasticsearch
										? m["settings.system.reindex_elasticsearch_desc"]()
										: m["settings.system.reindex_pgroonga_desc"]()}
								</p>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => reindexMutation.mutate()}
							disabled={reindexMutation.isPending || !isElasticsearch}
						>
							{reindexMutation.isPending ? (
								<Loader2 className="mr-1.5 size-4 animate-spin" />
							) : (
								<Search className="mr-1.5 size-4" />
							)}
							{m["settings.system.reindex"]()}
						</Button>
					</div>
					<div className="flex items-center justify-between px-6 py-4">
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-chart-5/10">
								<Palette className="size-4.5 text-chart-5" />
							</div>
							<div>
								<p className="font-medium text-sm">
									{m["settings.system.extract_cover_colors"]()}
								</p>
								<p className="text-muted-foreground text-xs">
									{m["settings.system.extract_cover_colors_desc"]()}
								</p>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => backfillColorsMutation.mutate()}
							disabled={backfillColorsMutation.isPending}
						>
							{backfillColorsMutation.isPending ? (
								<Loader2 className="mr-1.5 size-4 animate-spin" />
							) : (
								<Palette className="mr-1.5 size-4" />
							)}
							{m["settings.system.extract"]()}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
