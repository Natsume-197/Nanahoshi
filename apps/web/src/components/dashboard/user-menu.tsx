import { Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();
	const { data: orgs, isPending: orgsPending } =
		authClient.useListOrganizations();

	if (isPending) {
		return (
			<Skeleton
				className={collapsed ? "size-9 rounded-full" : "h-9 w-24 rounded-full"}
			/>
		);
	}

	if (!session) {
		return (
			<Link to="/login">
				<Button variant="outline">{collapsed ? "..." : "Sign In"}</Button>
			</Link>
		);
	}

	const initials = session.user.name
		?.split(" ")
		.map((n) => n[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();

	const activeOrgId = session.session.activeOrganizationId;
	const activeOrg = orgs?.find((org) => org.id === activeOrgId);

	const handleGoToProfile = () => {
		navigate({ to: "/dashboard/profile" });
	};

	const handleSignOut = () => {
		authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					navigate({ to: "/" });
				},
			},
		});
	};

	const handleSwitchOrg = (organizationId: string) => {
		if (organizationId === activeOrgId) return;
		authClient.organization.setActive(
			{ organizationId },
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
				render={
					<Button
						variant="outline"
						className={
							collapsed
								? "size-9 rounded-full p-0"
								: "h-9 rounded-full pr-3 pl-1"
						}
					/>
				}
			>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[11px] text-foreground">
					{initials}
				</span>
				{!collapsed && <span className="truncate">{session.user.name}</span>}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>My Account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="font-normal text-muted-foreground">
						{session.user.email}
					</DropdownMenuLabel>
					<DropdownMenuItem onClick={handleGoToProfile}>
						My Profile
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>Organization</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="min-w-48 bg-card">
							<DropdownMenuLabel className="truncate">
								{activeOrg?.name ?? "Select organization"}
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{orgsPending && (
								<DropdownMenuItem disabled>
									Loading organizations...
								</DropdownMenuItem>
							)}
							{!orgsPending &&
								orgs?.map((org) => (
									<DropdownMenuItem
										key={org.id}
										onClick={() => handleSwitchOrg(org.id)}
									>
										<span className="flex-1 truncate">{org.name}</span>
										{org.id === session.session.activeOrganizationId && (
											<Check />
										)}
									</DropdownMenuItem>
								))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onClick={handleSignOut}>
						Sign Out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
