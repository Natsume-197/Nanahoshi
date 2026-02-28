import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Building2, Library, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/admin/")({
	component: AdminOverview,
});

function AdminOverview() {
	const { data: stats, isLoading } = useQuery(
		orpc.admin.getSystemStats.queryOptions(),
	);

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
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{statCards.map(({ label, value, icon: Icon }) => (
					<Card key={label}>
						<CardHeader className="flex flex-row items-center justify-between border-b">
							<CardTitle className="font-medium text-sm">{label}</CardTitle>
							<Icon className="size-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							{isLoading ? (
								<div className="h-8 w-16 animate-pulse rounded bg-muted" />
							) : (
								<p className="font-bold text-2xl">{value}</p>
							)}
						</CardContent>
					</Card>
				))}
			</div>

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
		</div>
	);
}
