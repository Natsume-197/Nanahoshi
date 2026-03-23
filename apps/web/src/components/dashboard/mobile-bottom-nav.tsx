import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
	Check,
	Compass,
	Folder,
	Heart,
	Home,
	Library,
	LogOut,
	MailOpen,
	Settings,
	User,
} from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { client, queryClient } from "@/utils/orpc";

const tabs = [
	{ label: "Home", icon: Home, href: "/dashboard" as const, exact: true },
	{
		label: "Activity",
		icon: Compass,
		href: "/dashboard/activity" as const,
		exact: false,
	},
	{
		label: "Likes",
		icon: Heart,
		href: "/dashboard/likes" as const,
		exact: false,
	},
	{
		label: "Library",
		icon: Library,
		href: "/dashboard/series" as const,
		exact: false,
	},
] as const;

const moreNavItems = [
	{
		label: "Collections",
		icon: Folder,
		href: "/dashboard/collections" as const,
	},
	{
		label: "Settings",
		icon: Settings,
		href: "/dashboard/settings" as const,
	},
	{
		label: "Invitations",
		icon: MailOpen,
		href: "/dashboard/invitations" as const,
	},
] as const;

export function MobileBottomNav() {
	const location = useLocation();
	const navigate = useNavigate();
	const router = useRouter();
	const [moreOpen, setMoreOpen] = useState(false);
	const { data: session } = authClient.useSession();
	const { data: orgs } = authClient.useListOrganizations();

	const isMoreActive = moreNavItems.some((item) =>
		location.pathname.startsWith(item.href),
	);

	const activeOrgId = session?.session.activeOrganizationId;
	const activeOrg = orgs?.find((o) => o.id === activeOrgId);

	const handleGoToProfile = () => {
		setMoreOpen(false);
		const username = (session?.user as { username?: string })?.username;
		if (username) {
			navigate({
				to: "/dashboard/user/$username",
				params: { username },
			});
		} else {
			navigate({ to: "/dashboard/profile" });
		}
	};

	const handleSwitchOrg = (orgId: string) => {
		if (orgId === activeOrgId) return;
		authClient.organization.setActive({ organizationId: orgId });
		client.users.setLastActiveOrg({ organizationId: orgId }).catch(() => {});
		queryClient.invalidateQueries();
		setMoreOpen(false);
	};

	const handleSignOut = () => {
		setMoreOpen(false);
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

	return (
		<>
			<nav className="fixed inset-x-0 bottom-0 z-30 bg-background md:hidden">
				<div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
					{tabs.map((tab) => {
						const isActive = tab.exact
							? location.pathname === tab.href
							: location.pathname.startsWith(tab.href);

						return (
							<Link
								key={tab.href}
								to={tab.href}
								className={cn(
									"flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
									isActive
										? "text-foreground"
										: "text-muted-foreground active:text-foreground",
								)}
							>
								<tab.icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
								<span className={cn(isActive && "font-medium")}>
									{tab.label}
								</span>
							</Link>
						);
					})}

					<Button
						variant="ghost"
						onClick={() => setMoreOpen(true)}
						className={cn(
							"flex h-auto flex-1 flex-col items-center gap-0.5 rounded-none py-2 text-[10px]",
							isMoreActive
								? "text-foreground"
								: "text-muted-foreground active:text-foreground",
						)}
					>
						{session ? (
							<UserAvatar
								name={session.user.name}
								image={session.user.image}
								className={cn(
									"size-5 ring-1 ring-border",
									isMoreActive && "ring-2 ring-foreground",
								)}
								fallbackClassName="text-[8px]"
							/>
						) : (
							<User className="size-5" />
						)}
						<span className={cn(isMoreActive && "font-medium")}>Me</span>
					</Button>
				</div>
			</nav>

			<Sheet open={moreOpen} onOpenChange={setMoreOpen}>
				<SheetContent
					side="bottom"
					showCloseButton={false}
					className="pb-[env(safe-area-inset-bottom)]"
				>
					<SheetHeader className="sr-only">
						<SheetTitle>Menu</SheetTitle>
						<SheetDescription>Navigation and account options</SheetDescription>
					</SheetHeader>

					{/* User info header */}
					{session && (
						<div className="flex items-center gap-3 px-4 pt-2 pb-3">
							<UserAvatar
								name={session.user.name}
								image={session.user.image}
								className="size-10"
								fallbackClassName="text-sm"
							/>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">
									{session.user.name}
								</p>
								<p className="truncate text-muted-foreground text-xs">
									{session.user.email}
								</p>
							</div>
						</div>
					)}

					<Separator />

					{/* Navigation items */}
					<nav className="flex flex-col gap-1 p-2">
						{session && (
							<button
								type="button"
								onClick={handleGoToProfile}
								className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors active:bg-accent/50"
							>
								<User className="size-5" />
								<span>My Profile</span>
							</button>
						)}

						{moreNavItems.map((item) => {
							const isActive = location.pathname.startsWith(item.href);

							return (
								<Link
									key={item.href}
									to={item.href}
									onClick={() => setMoreOpen(false)}
									className={cn(
										"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
										isActive
											? "bg-accent font-medium text-foreground"
											: "text-muted-foreground active:bg-accent/50",
									)}
								>
									<item.icon className="size-5" />
									<span>{item.label}</span>
								</Link>
							);
						})}
					</nav>

					{/* Organization switcher */}
					{orgs && orgs.length > 1 && (
						<>
							<Separator />
							<div className="p-2">
								<p className="px-3 py-1.5 font-medium text-muted-foreground text-xs">
									Organization
								</p>
								{orgs.map((org) => {
									const isActive = org.id === activeOrgId;
									return (
										<button
											key={org.id}
											type="button"
											onClick={() => handleSwitchOrg(org.id)}
											className={cn(
												"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
												isActive
													? "bg-accent font-medium text-foreground"
													: "text-muted-foreground active:bg-accent/50",
											)}
										>
											<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 font-semibold text-[8px] text-primary">
												{org.name
													.split(/[\s-_]+/)
													.map((w) => w[0])
													.join("")
													.slice(0, 2)
													.toUpperCase()}
											</span>
											<span className="flex-1 truncate">{org.name}</span>
											{isActive && (
												<Check className="size-4 shrink-0 text-primary" />
											)}
										</button>
									);
								})}
							</div>
						</>
					)}

					{/* Sign out */}
					{session && (
						<>
							<Separator />
							<div className="p-2">
								<button
									type="button"
									onClick={handleSignOut}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-destructive text-sm transition-colors active:bg-destructive/10"
								>
									<LogOut className="size-5" />
									<span>Sign Out</span>
								</button>
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
}
