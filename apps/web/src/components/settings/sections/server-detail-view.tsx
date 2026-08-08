import { ArrowLeft } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table";
import {
	orgMembersColumns,
	orgMembersTableFeatures,
} from "@/components/data-table/columns/org-members-columns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/utils/orpc";

export function ServerDetailView({
	orgId,
	onBack,
}: {
	orgId: string;
	onBack: () => void;
}) {
	const { data, isLoading } = useQuery(
		orpc.admin.getOrgWithMembers.queryOptions({ input: { orgId } }),
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Button variant="outline" size="icon-sm" onClick={onBack}>
					<ArrowLeft />
				</Button>
				<div>
					{isLoading ? (
						<>
							<Skeleton className="mb-1 h-7 w-48 rounded" />
							<Skeleton className="h-4 w-32 rounded" />
						</>
					) : data ? (
						<>
							<h2 className="font-bold text-xl tracking-tight">{data.name}</h2>
							<p className="font-mono text-muted-foreground text-sm">
								{data.slug}
							</p>
						</>
					) : (
						<>
							<h2 className="font-bold text-xl tracking-tight">
								Server not found
							</h2>
							<p className="text-muted-foreground text-sm">
								This server may have been deleted.
							</p>
						</>
					)}
				</div>
			</div>

			{(isLoading || data) && (
				<div className="space-y-4">
					<div>
						<h3 className="font-semibold text-base">Members</h3>
						<p className="text-muted-foreground text-sm">
							{data?.members?.length ?? 0} member
							{data?.members?.length !== 1 ? "s" : ""} in this server
						</p>
					</div>

					<DataTable
						features={orgMembersTableFeatures}
						columns={orgMembersColumns}
						data={data?.members ?? []}
						isLoading={isLoading}
						searchColumn="member"
						searchPlaceholder="Filter by name..."
						emptyState={{ description: "No members in this server." }}
						meta={{ orgId }}
					/>
				</div>
			)}
		</div>
	);
}
