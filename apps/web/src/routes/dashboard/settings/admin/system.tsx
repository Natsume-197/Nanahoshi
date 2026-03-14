import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	BookOpen,
	Building2,
	Database,
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
import { getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/settings/admin/system")({
	component: AdminSystem,
});

function AdminSystem() {
	const { data: stats, isLoading } = useQuery(
		orpc.admin.getSystemStats.queryOptions(),
	);

	const reindexMutation = useMutation({
		mutationFn: () => client.admin.triggerBookReindex(),
		onSuccess: () => toast.success("Book reindex started"),
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to start book reindex")),
	});

	const backfillColorsMutation = useMutation({
		mutationFn: () => client.admin.backfillCoverColors(),
		onSuccess: (data) => {
			if (data.enqueued === 0) {
				toast.info("All covers already have colors extracted");
			} else {
				toast.success(
					`Extracting colors for ${data.enqueued} covers in background`,
				);
			}
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to start color extraction")),
	});

	const searchProvider = stats?.searchProvider ?? "pgroonga";
	const isElasticsearch = searchProvider === "elasticsearch";

	const statCards = [
		{ label: "Users", value: stats?.userCount ?? 0, icon: Users },
		{
			label: "Organizations",
			value: stats?.organizationCount ?? 0,
			icon: Building2,
		},
		{ label: "Books", value: stats?.bookCount ?? 0, icon: BookOpen },
		{ label: "Libraries", value: stats?.libraryCount ?? 0, icon: Library },
	];

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">System</h2>
				<p className="text-muted-foreground text-sm">
					System statistics and maintenance
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
					<CardTitle>Search Engine</CardTitle>
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
									? "External search engine with Japanese analyzer support"
									: "Built-in PostgreSQL full-text search (lightweight)"}
							</span>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="border-b">
					<CardTitle>Queue Dashboard</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="mb-3 text-muted-foreground text-sm">
						Monitor and manage background job queues (book indexing, file
						events).
					</p>
					<a
						href="/admin/queues/"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
					>
						Open Bull Board
					</a>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="border-b">
					<CardTitle>Maintenance</CardTitle>
				</CardHeader>
				<CardContent className="divide-y divide-border p-0">
					<div className="flex items-center justify-between px-6 py-4">
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
								<Search className="size-4.5 text-primary" />
							</div>
							<div>
								<p className="font-medium text-sm">Reindex books</p>
								<p className="text-muted-foreground text-xs">
									{isElasticsearch
										? "Rebuild the full Elasticsearch index for all books"
										: "Not needed with PGroonga — data is always in sync"}
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
							Reindex
						</Button>
					</div>
					<div className="flex items-center justify-between px-6 py-4">
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-chart-5/10">
								<Palette className="size-4.5 text-chart-5" />
							</div>
							<div>
								<p className="font-medium text-sm">Extract cover colors</p>
								<p className="text-muted-foreground text-xs">
									Analyze book covers to extract their dominant color for UI
									accents
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
							Extract
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
