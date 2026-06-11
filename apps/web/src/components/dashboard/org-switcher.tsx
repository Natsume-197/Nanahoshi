import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { client, queryClient } from "@/utils/orpc";

function orgInitials(name: string) {
	return name
		.split(/[\s-_]+/)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function OrgBadge({ name, className }: { name: string; className?: string }) {
	return (
		<span
			className={cn(
				"flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[10px] text-muted-foreground",
				className,
			)}
		>
			{orgInitials(name)}
		</span>
	);
}

export function OrgSwitcher() {
	const navigate = useNavigate();
	const { data: orgs, isPending } = authClient.useListOrganizations();
	const { data: activeOrg } = authClient.useActiveOrganization();

	if (isPending) {
		return <Skeleton className="h-9 w-40 rounded-full" />;
	}

	if (!orgs || orgs.length === 0) {
		return null;
	}

	const handleSwitchOrg = async (orgId: string) => {
		if (orgId === activeOrg?.id) return;
		// Wait for the session's active org to actually change before refetching,
		// otherwise queries reload with the *previous* org and only pick up the
		// new one on a second switch.
		await authClient.organization.setActive({ organizationId: orgId });
		client.users.setLastActiveOrg({ organizationId: orgId }).catch(() => {});
		// Leave any org-scoped resource page (e.g. a book detail) behind first: it
		// belongs to the previous org and would otherwise show stale data — and the
		// book loader would switch the active org back on refresh. Navigating before
		// invalidating also unmounts the book page so its now-inactive queries don't
		// refetch under the new org and fire "not found" error toasts.
		await navigate({ to: "/dashboard" });
		await queryClient.invalidateQueries();
	};

	const activeName = activeOrg?.name ?? "Select workspace";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					className="h-9 max-w-52 gap-2 rounded-full pr-3 pl-1"
				>
					<OrgBadge name={activeName} />
					<span className="truncate">{activeName}</span>
					<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={6}
				className="min-w-56 bg-card"
			>
				<DropdownMenuLabel className="text-muted-foreground text-xs">
					Servers
				</DropdownMenuLabel>
				{orgs.map((org) => {
					const isActive = org.id === activeOrg?.id;
					return (
						<DropdownMenuItem
							key={org.id}
							onClick={() => handleSwitchOrg(org.id)}
							className="gap-2.5"
						>
							<OrgBadge name={org.name} className="size-6 text-[9px]" />
							<span className="flex-1 truncate">{org.name}</span>
							{isActive && <Check className="size-4 shrink-0 text-primary" />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
