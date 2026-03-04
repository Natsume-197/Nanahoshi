import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";

export function OrgSwitcher() {
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const { data: orgs, isPending: orgsPending } =
		authClient.useListOrganizations();

	if (sessionPending || orgsPending) {
		return <Skeleton className="h-9 w-full" />;
	}

	if (!session || !orgs || orgs.length === 0) {
		return null;
	}

	const activeOrg = orgs.find(
		(o) => o.id === session.session.activeOrganizationId,
	);

	const handleSwitch = (orgId: string) => {
		if (orgId === session.session.activeOrganizationId) return;
		authClient.organization.setActive(
			{ organizationId: orgId },
			{
				onSuccess: () => {
					queryClient.invalidateQueries();
				},
			},
		);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="outline" className="w-full justify-between" />}
			>
				<span className="truncate">{activeOrg?.name ?? "Select org"}</span>
				<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Organizations</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{orgs.map((org) => (
						<DropdownMenuItem key={org.id} onClick={() => handleSwitch(org.id)}>
							<span className="flex-1 truncate">{org.name}</span>
							{org.id === session.session.activeOrganizationId && (
								<Check className="ml-2 size-4" />
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
