import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table";
import { usersColumns } from "@/components/data-table/columns/users-columns";
import { orpc } from "@/utils/orpc";

export function AdminUsers() {
	const { data, isLoading } = useQuery(orpc.admin.listUsers.queryOptions());

	const users = data ?? [];

	return (
		<div className="space-y-6">
			<div>
				<p className="text-muted-foreground text-sm">
					Manage all users in the system
				</p>
			</div>

			<DataTable
				columns={usersColumns}
				data={users}
				isLoading={isLoading}
				searchColumn="email"
				searchPlaceholder="Filter by email..."
				emptyState={{ description: "No users found." }}
			/>
		</div>
	);
}
