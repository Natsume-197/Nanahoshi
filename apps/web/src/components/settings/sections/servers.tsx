import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import {
	serversColumns,
	serversTableFeatures,
} from "@/components/data-table/columns/servers-columns";
import { CreateServerDialog } from "@/components/servers/create-server-dialog";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export function AdminServers({
	onSelectOrg,
}: {
	/** When provided (settings modal), org rows open detail in-place. */
	onSelectOrg?: (orgId: string) => void;
}) {
	const { data: servers, isLoading } = useQuery(
		orpc.admin.listServers.queryOptions(),
	);

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex items-start justify-between gap-4">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-foreground text-xl">
							{m["settings.nav.servers"]()}
						</h2>
						<p className="text-muted-foreground text-sm">
							Manage all servers in the system
						</p>
					</div>
					<CreateServerButton />
				</div>

				<DataTable
					features={serversTableFeatures}
					columns={serversColumns}
					data={servers ?? []}
					isLoading={isLoading}
					searchColumn="name"
					searchPlaceholder="Filter by name..."
					emptyState={{ description: "No servers yet." }}
					meta={onSelectOrg ? { onSelectOrg } : undefined}
				/>
			</section>
		</div>
	);
}

function CreateServerButton() {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				<Plus data-icon="inline-start" />
				{m["server.create"]()}
			</Button>

			<CreateServerDialog open={open} onOpenChange={setOpen} />
		</>
	);
}
