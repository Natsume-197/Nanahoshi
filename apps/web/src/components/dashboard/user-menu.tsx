import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Check, MailOpen, Settings, User } from "lucide-react";
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
			<DropdownMenuTrigger asChild>
				<Button
					variant={collapsed ? "ghost" : "outline"}
					className={
						collapsed
							? "size-8 rounded-full p-0 hover:bg-transparent"
							: "h-9 rounded-full pr-3 pl-1"
					}
				>
					<UserAvatar
						name={session.user.name}
						image={session.user.image}
						className={collapsed ? "size-8 shrink-0" : "size-7 shrink-0"}
						fallbackClassName="text-[11px]"
					/>
					{!collapsed && <span className="truncate">{session.user.name}</span>}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-56 bg-card">
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={handleGoToProfile}>
						<User />
						Profile
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem asChild>
						<Link to="/dashboard/invitations">
							<MailOpen />
							Invitations
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link to="/dashboard/settings">
							<Settings />
							Settings
						</Link>
					</DropdownMenuItem>
				</DropdownMenuGroup>

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
