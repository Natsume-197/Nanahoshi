import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { queryClient } from "@/utils/orpc";
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

	const _activeOrgId = session.session.activeOrganizationId;
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
					await queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
					await router.invalidate();
					navigate({ to: "/login" });
				},
			},
		});
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
					<DropdownMenuItem variant="destructive" onClick={handleSignOut}>
						Sign Out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
