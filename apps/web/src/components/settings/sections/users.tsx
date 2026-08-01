import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table";
import { usersColumns } from "@/components/data-table/columns/users-columns";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export function AdminUsers() {
	const { data, isLoading } = useQuery(orpc.admin.listUsers.queryOptions());

	const users = data ?? [];

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.nav.users"]()}
					</h2>
					<p className="text-muted-foreground text-sm">
						{m["settings.users.description"]()}
					</p>
				</div>

				<DataTable
					columns={usersColumns}
					data={users}
					isLoading={isLoading}
					searchColumn="email"
					searchPlaceholder={m["settings.users.filter_placeholder"]()}
					emptyState={{ description: m["settings.users.empty"]() }}
				/>
			</section>
		</div>
	);
}
