import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Check, ChevronsUpDown } from "lucide-react";
import { UserAvatar } from "@/components/shared/user-avatar";
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
import { cn } from "@/lib/utils";
import { client, queryClient } from "@/utils/orpc";

function getOrgInitials(name: string) {
	return name
		.split(/[\s-_]+/)
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function OrgAvatar({ name, className }: { name: string; className?: string }) {
	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded-md bg-primary/10 font-semibold text-[10px] text-primary",
				className,
			)}
		>
			{getOrgInitials(name)}
		</div>
	);
}

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
	const navigate = useNavigate();
	const router = useRouter();
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

	const activeOrgId = session.session.activeOrganizationId;
	const activeOrg = orgs?.find((o) => o.id === activeOrgId);

	const handleGoToProfile = () => {
		const username = (session.user as { username?: string }).username;
		if (username) {
			navigate({
				to: "/dashboard/user/$username",
				params: { username },
			});
		} else {
			navigate({ to: "/dashboard/profile" });
		}
	};

	const handleSignOut = () => {
		authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					queryClient.removeQueries({ queryKey: ["auth", "session"] });
					queryClient.clear();
					await router.invalidate();
					navigate({ to: "/login" });
				},
			},
		});
	};

	const handleSwitchOrg = (orgId: string) => {
		if (orgId === activeOrgId) return;
		authClient.organization.setActive({ organizationId: orgId });
		client.users.setLastActiveOrg({ organizationId: orgId }).catch(() => {});
		queryClient.invalidateQueries();
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
				<UserAvatar
					name={session.user.name}
					image={session.user.image}
					className="size-7 shrink-0"
					fallbackClassName="bg-muted text-[11px] text-foreground"
				/>
				{!collapsed && <span className="truncate">{session.user.name}</span>}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-56 bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>My Account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="font-normal text-muted-foreground">
						{session.user.email}
					</DropdownMenuLabel>
					<DropdownMenuItem onClick={handleGoToProfile}>
						My Profile
					</DropdownMenuItem>
				</DropdownMenuGroup>

				{orgs && orgs.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuLabel>Organization</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{orgs.map((org) => {
								const isActive = org.id === activeOrgId;
								return (
									<DropdownMenuItem
										key={org.id}
										onClick={() => handleSwitchOrg(org.id)}
										className="gap-2"
									>
										<OrgAvatar name={org.name} className="size-5" />
										<span className="flex-1 truncate">{org.name}</span>
										{isActive && (
											<Check className="size-3.5 shrink-0 text-primary" />
										)}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuGroup>
					</>
				)}

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem variant="destructive" onClick={handleSignOut}>
						Sign Out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
