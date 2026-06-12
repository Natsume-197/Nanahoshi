import { useQuery } from "@tanstack/react-query";
import {
	Link,
	useLocation,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
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
import { ThemeOptions } from "@/components/shared/theme-toggle";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";
import { clearOfflineCaches } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { client, orpc, queryClient } from "@/utils/orpc";

const tabs = [
	{
		label: "Home",
		icon: Home,
		href: "/dashboard" as const,
		exact: true,
		needsNetwork: false,
	},
	{
		label: "Activity",
		icon: Compass,
		href: "/dashboard/activity" as const,
		exact: false,
		needsNetwork: true,
	},
	{
		label: "Likes",
		icon: Heart,
		href: "/dashboard/likes" as const,
		exact: false,
		needsNetwork: true,
	},
	{
		label: "Library",
		icon: Library,
		href: "/dashboard/series" as const,
		exact: false,
		needsNetwork: true,
	},
] as const;

const moreNavItems = [
	{
		label: "Collections",
		icon: Folder,
		href: "/dashboard/collections" as const,
		needsNetwork: true,
	},
	{
		label: "Settings",
		icon: Settings,
		href: "/dashboard/settings" as const,
		needsNetwork: false,
	},
	{
		label: "Invitations",
		icon: MailOpen,
		href: "/dashboard/invitations" as const,
		needsNetwork: true,
	},
] as const;

export function MobileBottomNav() {
	const location = useLocation();
	const navigate = useNavigate();
	const router = useRouter();
	const [moreOpen, setMoreOpen] = useState(false);
	const online = useOnlineStatus();
	const { theme, setTheme } = useTheme();
	const { data: session } = authClient.useSession();
	const { data: orgs } = authClient.useListOrganizations();
	// Resolved (per-active-org) avatar; falls back to the global account image.
	const { data: profile } = useQuery({
		...orpc.profile.getProfile.queryOptions(),
		enabled: !!session,
	});
	const avatarImage =
		(profile?.image as string | null | undefined) ?? session?.user.image;

	const isMoreActive = moreNavItems.some((item) =>
		location.pathname.startsWith(item.href),
	);

	const activeOrgId = session?.session.activeOrganizationId;

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

	const handleSwitchOrg = async (orgId: string) => {
		if (orgId === activeOrgId) return;
		setMoreOpen(false);
		// Wait for the session's active org to change before refetching, otherwise
		// queries reload with the previous org.
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

	const handleSignOut = () => {
		setMoreOpen(false);
		authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					queryClient.removeQueries({ queryKey: ["auth", "session"] });
					queryClient.clear();
					await clearOfflineCaches();
					await router.invalidate();
					navigate({ to: "/login" });
				},
			},
		});
	};

	return (
		<>
			<nav
				data-slot="mobile-bottom-nav"
				className="fixed inset-x-0 bottom-0 z-30 bg-background md:hidden"
			>
				<div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
					{tabs.map((tab) => {
						const isActive = tab.exact
							? location.pathname === tab.href
							: location.pathname.startsWith(tab.href);
						const disabled = tab.needsNetwork && !online;

						return (
							<Link
								key={tab.href}
								to={tab.href}
								aria-disabled={disabled}
								tabIndex={disabled ? -1 : undefined}
								className={cn(
									"flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
									isActive
										? "text-foreground"
										: "text-muted-foreground active:text-foreground",
									disabled && "pointer-events-none opacity-40",
								)}
							>
								<tab.icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
								<span className={cn(isActive && "font-medium")}>
									{tab.label}
								</span>
							</Link>
						);
					})}

					<button
						type="button"
						onClick={() => setMoreOpen(true)}
						className={cn(
							"flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
							isMoreActive
								? "text-foreground"
								: "text-muted-foreground active:text-foreground",
						)}
					>
						{session ? (
							<UserAvatar
								name={session.user.name}
								image={avatarImage}
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
					</button>
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
								image={avatarImage}
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
								disabled={!online}
								className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground text-sm transition-colors active:bg-accent/50 disabled:pointer-events-none disabled:opacity-40"
							>
								<User className="size-5" />
								<span>My Profile</span>
							</button>
						)}

						{moreNavItems.map((item) => {
							const isActive = location.pathname.startsWith(item.href);
							const disabled = item.needsNetwork && !online;

							return (
								<Link
									key={item.href}
									to={item.href}
									onClick={() => setMoreOpen(false)}
									aria-disabled={disabled}
									tabIndex={disabled ? -1 : undefined}
									className={cn(
										"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
										isActive
											? "bg-accent font-medium text-foreground"
											: "text-muted-foreground active:bg-accent/50",
										disabled && "pointer-events-none opacity-40",
									)}
								>
									<item.icon className="size-5" />
									<span>{item.label}</span>
								</Link>
							);
						})}
					</nav>

					{/* Theme */}
					<Separator />
					<div className="p-2">
						<p className="px-3 py-1.5 font-medium text-muted-foreground text-xs">
							Appearance
						</p>
						<ThemeOptions value={theme} onChange={setTheme} />
					</div>

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
