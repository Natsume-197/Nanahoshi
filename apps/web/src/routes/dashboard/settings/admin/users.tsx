import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/data-table";
import { orpc } from "@/utils/orpc";
import { usersColumns } from "@/components/data-table/columns/users-columns";

export const Route = createFileRoute("/dashboard/settings/admin/users")({
	component: AdminUsers,
});

function AdminUsers() {
	const { data, isLoading } = useQuery(orpc.admin.listUsers.queryOptions());

	const users = data ?? [];

	return (
		<div className="space-y-6">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Users</h2>
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
