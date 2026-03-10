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
import { client, queryClient } from "@/utils/orpc";

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

	const activeOrgId = session.session.activeOrganizationId;
	const activeOrg = orgs.find((o) => o.id === activeOrgId);

	const handleSwitch = (orgId: string) => {
		if (orgId === activeOrgId) return;
		// Call both in parallel: setActive updates the session cookie,
		// setLastActiveOrg persists to DB for cross-device restoration.
		// onSuccess callbacks are unreliable in better-auth client, so we call directly.
		authClient.organization.setActive({ organizationId: orgId });
		client.users.setLastActiveOrg({ organizationId: orgId }).catch(() => {});
		queryClient.invalidateQueries();
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
