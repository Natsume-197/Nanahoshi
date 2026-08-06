import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AccountMenuItems } from "@/components/dashboard/account-menu";
import {
	resolvePresenceStatus,
	STATUS_META,
} from "@/components/shared/presence-status";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export function UserMenu({
	collapsed = false,
	align = "end",
}: {
	collapsed?: boolean;
	align?: "start" | "center" | "end";
}) {
	const navigate = useNavigate();
	const { data: session, isPending } = useSession();
	// Resolved (per-active-org) avatar; falls back to the global account image.
	const { data: profile } = useQuery({
		...orpc.profile.getProfile.queryOptions(),
		enabled: !!session,
	});
	const avatarImage =
		(profile?.image as string | null | undefined) ?? session?.user.image;
	const status = resolvePresenceStatus(profile);

	if (isPending) {
		return (
			<Skeleton
				className={collapsed ? "size-9 rounded-lg" : "h-9 w-24 rounded-full"}
			/>
		);
	}

	if (!session) {
		return (
			<Link to="/login">
				<Button variant="outline">
					{collapsed ? "..." : m["auth.sign_in"]()}
				</Button>
			</Link>
		);
	}

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

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={collapsed ? "ghost" : "outline"}
					className={
						collapsed
							? // Avatar-only icon button for the header's action cluster.
								"size-9 rounded-full p-0"
							: "h-9 rounded-full ps-1 pe-3"
					}
				>
					<span className="relative shrink-0">
						<UserAvatar
							name={session.user.name}
							image={avatarImage}
							className={collapsed ? "size-9 rounded-full" : "size-7"}
							fallbackClassName="text-[11px]"
						/>
						<span
							className={cn(
								"absolute right-0 bottom-0 size-2.5 rounded-full ring-2",
								collapsed ? "ring-sidebar" : "ring-background",
								STATUS_META[status].dot,
							)}
						/>
					</span>
					{!collapsed && <span className="truncate">{session.user.name}</span>}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} sideOffset={8} className="min-w-56">
				<AccountMenuItems onGoToProfile={handleGoToProfile} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
