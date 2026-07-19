import {
	BookOpen,
	Books,
	Buildings,
	Check,
	EnvelopeOpen,
	Folder,
	GearSix,
	Headphones,
	Heart,
	House,
	Microphone,
	SignOut,
	Tag,
	User,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import {
	Link,
	useLocation,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { clearOfflineCaches } from "@/lib/offline";
import {
	isServerScopedDetailPath,
	switchActiveServer,
} from "@/lib/switch-server";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

const tabs = [
	{
		kind: "link",
		label: m["nav.home"],
		icon: House,
		href: "/dashboard" as const,
		exact: true,
		needsNetwork: false,
	},
	{
		kind: "link",
		label: m["nav.collections"],
		icon: Folder,
		href: "/dashboard/collections" as const,
		exact: false,
		needsNetwork: true,
	},
	{
		kind: "link",
		label: m["nav.likes"],
		icon: Heart,
		href: "/dashboard/likes" as const,
		exact: false,
		needsNetwork: true,
	},
] as const;

// Catalog sections behind the "Library" tab (mirrors the desktop sidebar's
// Browse group), surfaced on mobile as a bottom sheet instead of a single link.
const browseNavItems = [
	{ label: m["nav.series"], icon: Books, href: "/dashboard/series" as const },
	{ label: m["nav.authors"], icon: User, href: "/dashboard/authors" as const },
	{
		label: m["nav.narrators"],
		icon: Microphone,
		href: "/dashboard/narrators" as const,
	},
	{ label: m["nav.genres"], icon: Tag, href: "/dashboard/genres" as const },
	{
		label: m["nav.publishers"],
		icon: Buildings,
		href: "/dashboard/publishers" as const,
	},
] as const;

const moreNavItems = [
	{
		label: m["nav.invitations"],
		icon: EnvelopeOpen,
		href: "/dashboard/invitations" as const,
		needsNetwork: true,
	},
] as const;

export function MobileBottomNav() {
	const location = useLocation();
	const navigate = useNavigate();
	const router = useRouter();
	const [moreOpen, setMoreOpen] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const online = useOnlineStatus();
	const { openSettings } = useSettingsModal();
	const { data: session } = useSession();
	const { data: orgs } = authClient.useListOrganizations();
	// Resolved (per-active-org) avatar; falls back to the global account image.
	const { data: profile } = useQuery({
		...orpc.profile.getProfile.queryOptions(),
		enabled: !!session,
	});
	const avatarImage =
		(profile?.image as string | null | undefined) ?? session?.user.image;
	// Same query the desktop sidebar uses (React Query dedupes); only fetched once
	// the Library sheet is opened so it doesn't run on every mobile page.
	const libraries = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		staleTime: 30_000,
		enabled: libraryOpen,
	});
	// Narrators only exist for audiobooks; hide the entry on servers without any.
	const { data: narratorCount } = useQuery({
		...orpc.narrators.count.queryOptions(),
		staleTime: 300_000,
		enabled: libraryOpen,
	});
	const visibleBrowseItems = browseNavItems.filter(
		(item) => item.href !== "/dashboard/narrators" || (narratorCount ?? 0) > 0,
	);

	const isMoreActive = moreNavItems.some((item) =>
		location.pathname.startsWith(item.href),
	);

	const isLibraryActive = browseNavItems.some((item) =>
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
		// Stay on list/index pages (they refetch under the new server); only leave
		// a catalog detail page, whose entity belongs to the previous server.
		const leave = isServerScopedDetailPath(location.pathname);
		await switchActiveServer(
			orgId,
			leave ? () => navigate({ to: "/dashboard" }) : undefined,
		);
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
				className="theme-gradient-surface fixed inset-x-0 bottom-0 z-30 bg-sidebar md:hidden"
			>
				<div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
					{tabs.map((tab) => {
						const disabled = tab.needsNetwork && !online;
						const tabClass = (isActive: boolean) =>
							cn(
								"flex flex-1 flex-col items-center gap-1 py-3 text-[10px] transition-colors",
								isActive
									? "text-foreground"
									: "text-muted-foreground active:text-foreground",
								disabled && "pointer-events-none opacity-40",
							);

						const isActive = tab.exact
							? location.pathname === tab.href
							: location.pathname.startsWith(tab.href);

						return (
							<Link
								key={tab.href}
								to={tab.href}
								aria-disabled={disabled}
								tabIndex={disabled ? -1 : undefined}
								className={tabClass(isActive)}
							>
								<tab.icon
									className="size-5"
									weight={isActive ? "fill" : "regular"}
								/>
								<span className={cn(isActive && "font-medium")}>
									{tab.label()}
								</span>
							</Link>
						);
					})}

					<button
						type="button"
						onClick={() => setLibraryOpen(true)}
						disabled={!online}
						aria-pressed={libraryOpen}
						className={cn(
							"flex flex-1 flex-col items-center gap-1 py-3 text-[10px] transition-colors",
							isLibraryActive
								? "text-foreground"
								: "text-muted-foreground active:text-foreground",
							!online && "pointer-events-none opacity-40",
						)}
					>
						<Books
							className="size-5"
							weight={isLibraryActive ? "fill" : "regular"}
						/>
						<span className={cn(isLibraryActive && "font-medium")}>
							{m["nav.library"]()}
						</span>
					</button>

					<button
						type="button"
						onClick={() => setMoreOpen(true)}
						className={cn(
							"flex flex-1 flex-col items-center gap-1 py-3 text-[10px] transition-colors",
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
						<span className={cn(isMoreActive && "font-medium")}>
							{m["nav.me"]()}
						</span>
					</button>
				</div>
			</nav>

			<Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
				<SheetContent
					side="bottom"
					showCloseButton={false}
					className="pb-[env(safe-area-inset-bottom)]"
				>
					<SheetHeader className="px-4 pt-2 pb-1 text-left">
						<SheetTitle className="text-sm tracking-wide">
							{m["nav.library"]()}
						</SheetTitle>
						<SheetDescription className="sr-only">
							{m["library.sheet_desc"]()}
						</SheetDescription>
					</SheetHeader>

					<nav className="flex flex-col gap-1 p-2">
						<p className="px-3 py-1.5 font-medium text-muted-foreground text-xs">
							{m["nav.libraries"]()}
						</p>
						{libraries.isLoading ? (
							<div className="space-y-2 px-3 py-2">
								<Skeleton className="h-5 w-40" />
								<Skeleton className="h-5 w-32" />
							</div>
						) : libraries.data?.length ? (
							libraries.data.map((lib) => {
								const Icon =
									lib.mediaType === "audiobook" ? Headphones : BookOpen;
								const isActive = location.pathname.startsWith(
									`/dashboard/libraries/${lib.uuid}`,
								);

								return (
									<Link
										key={lib.uuid}
										to="/dashboard/libraries/$uuid"
										params={{ uuid: lib.uuid }}
										onClick={() => setLibraryOpen(false)}
										aria-disabled={!online}
										tabIndex={online ? undefined : -1}
										className={cn(
											"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
											isActive
												? "bg-accent font-medium text-foreground"
												: "text-muted-foreground active:bg-accent/50",
											!online && "pointer-events-none opacity-40",
										)}
									>
										<Icon className="size-5" />
										<span className="truncate">
											{lib.name ?? m["library.untitled"]()}
										</span>
									</Link>
								);
							})
						) : (
							<p className="px-3 py-2 text-muted-foreground text-xs">
								{m["library.none"]()}
							</p>
						)}

						<Separator className="my-1" />

						<p className="px-3 py-1.5 font-medium text-muted-foreground text-xs">
							{m["nav.browse"]()}
						</p>
						{visibleBrowseItems.map((item) => {
							const isActive = location.pathname.startsWith(item.href);

							return (
								<Link
									key={item.href}
									to={item.href}
									onClick={() => setLibraryOpen(false)}
									aria-disabled={!online}
									tabIndex={online ? undefined : -1}
									className={cn(
										"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
										isActive
											? "bg-accent font-medium text-foreground"
											: "text-muted-foreground active:bg-accent/50",
										!online && "pointer-events-none opacity-40",
									)}
								>
									<item.icon className="size-5" />
									<span>{item.label()}</span>
								</Link>
							);
						})}
					</nav>
				</SheetContent>
			</Sheet>

			<Sheet open={moreOpen} onOpenChange={setMoreOpen}>
				<SheetContent
					side="bottom"
					showCloseButton={false}
					className="pb-[env(safe-area-inset-bottom)]"
				>
					<SheetHeader className="sr-only">
						<SheetTitle>{m["nav.menu"]()}</SheetTitle>
						<SheetDescription>{m["nav.menu_desc"]()}</SheetDescription>
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
								<span>{m["nav.my_profile"]()}</span>
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
									<span>{item.label()}</span>
								</Link>
							);
						})}

						<button
							type="button"
							onClick={() => {
								setMoreOpen(false);
								openSettings("profile");
							}}
							className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground text-sm transition-colors active:bg-accent/50"
						>
							<GearSix className="size-5" />
							<span>{m["nav.settings"]()}</span>
						</button>
					</nav>

					{/* Server switcher */}
					{orgs && orgs.length > 1 && (
						<>
							<Separator />
							<div className="p-2">
								<p className="px-3 py-1.5 font-medium text-muted-foreground text-xs">
									{m["nav.server"]()}
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
									<SignOut className="size-5" />
									<span>{m["nav.sign_out"]()}</span>
								</button>
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
}
