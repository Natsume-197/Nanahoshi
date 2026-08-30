import {
	BookOpen,
	BookOpenText,
	Books,
	Buildings,
	Folder,
	Headphones,
	House,
	MagnifyingGlass,
	Microphone,
	Tag,
	User,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
	getMobileTabPressAction,
	getProfileTabPath,
} from "@/components/dashboard/mobile-tab-navigation";
import { resolveRailSection } from "@/components/dashboard/rail-nav";
import { ReadListenIcon } from "@/components/read-listen/read-listen-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

const tabs = [
	{
		kind: "link",
		label: m["nav.home"],
		icon: House,
		href: "/dashboard" as const,
		exact: true,
	},
	{
		kind: "link",
		label: m["common.search"],
		icon: MagnifyingGlass,
		href: "/dashboard/search" as const,
		exact: true,
	},
	{
		kind: "link",
		label: m["nav.collections"],
		icon: Folder,
		href: "/dashboard/collections" as const,
		exact: false,
	},
] as const;

const LIBRARY_DRAWER_ID = "mobile-library-drawer";

const catalogEntries = [
	{
		section: "catalog",
		href: "/dashboard/books",
		label: m["nav.catalog"],
		icon: BookOpenText,
	},
	{
		section: "read-listen",
		href: "/dashboard/read-listen",
		label: m["nav.read_listen"],
		icon: ReadListenIcon,
	},
] as const;

const drawerItemClass = (isActive: boolean) =>
	cn(
		"flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
		isActive
			? "bg-accent font-medium text-foreground"
			: "text-muted-foreground active:bg-accent/50",
	);

// Catalog sections behind the "Library" tab (mirrors the desktop sidebar's
// Browse group), surfaced on mobile as a bottom drawer instead of a single link.
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

// Shared by every tab so the "Me" entry, which can't live in the `tabs` array
// (its href carries a param), stays visually identical to the rest.
//
// basis-0 + min-w-0: without them a long label (es "Colecciones" is 69px at
// 12px) widens its own tab and squeezes the others, so the icons stop being
// evenly spaced. Five tabs still leave 64px each at 320px; labels truncate while
// every destination retains the same full-height touch target.
const tabClass = (isActive: boolean) =>
	cn(
		"flex h-full min-w-0 flex-1 basis-0 touch-manipulation flex-col items-center justify-center gap-1 py-2 short:py-1 text-xs transition-colors",
		// --nav-inactive, not --muted-foreground: this bar has no chip behind the
		// active tab, so the luminance step is most of what marks it — and it has
		// to clear AA at 12px all the same. See index.css.
		isActive ? "text-foreground" : "text-nav-inactive active:text-foreground",
	);

export function MobileBottomNav({
	onReselectActiveTab,
}: {
	onReselectActiveTab: () => void;
}) {
	const location = useLocation();
	const [libraryOpen, setLibraryOpen] = useState(false);
	const { data: session } = useSession();
	// Resolved (per-active-org) avatar; falls back to the global account image.
	const { data: profile } = useQuery({
		...orpc.profile.getProfile.queryOptions(),
		enabled: !!session,
	});
	const avatarImage =
		(profile?.image as string | null | undefined) ?? session?.user.image;
	// Same query the desktop sidebar uses (React Query dedupes); only fetched once
	// the Library drawer is opened so it doesn't run on every mobile page.
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

	const railSection = resolveRailSection(location.pathname);

	const isLibraryActive =
		railSection === "catalog" ||
		location.pathname.startsWith("/dashboard/libraries") ||
		browseNavItems.some((item) => location.pathname.startsWith(item.href));

	// The tab goes straight to the profile page — no intermediate sheet. Account
	// actions (status, invitations, settings, sign out) live in that page's own
	// menu. Without a username the /dashboard/profile route resolves one and
	// redirects, so the tab still lands in the right place.
	// Trimmed, so the href and the path the active/reselect check compares
	// against can't disagree over a whitespace-only username.
	const username = (
		session?.user as { username?: string } | undefined
	)?.username?.trim();
	const profilePath = getProfileTabPath(username);
	// Profile tabs are search params, so the pathname alone decides the highlight.
	const isProfileActive = location.pathname === profilePath;

	const profileTabProps = {
		"data-pressable": "subtle",
		"aria-current": isProfileActive ? ("page" as const) : undefined,
		onClick: (event: { preventDefault: () => void }) => {
			if (
				getMobileTabPressAction(location.pathname, profilePath) === "reselect"
			) {
				event.preventDefault();
				onReselectActiveTab();
			}
		},
		className: tabClass(isProfileActive),
	};

	const profileTabBody = (
		<>
			{session ? (
				<UserAvatar
					name={session.user.name}
					image={avatarImage}
					className={cn(
						"size-5 ring-1 ring-border",
						isProfileActive && "ring-2 ring-foreground",
					)}
					fallbackClassName="text-[8px]"
				/>
			) : (
				<User aria-hidden="true" className="size-5" />
			)}
			<span
				className={cn("max-w-full truncate", isProfileActive && "font-medium")}
			>
				{m["nav.me"]()}
			</span>
		</>
	);

	return (
		<>
			<nav
				data-slot="mobile-bottom-nav"
				className="theme-gradient-surface fixed inset-x-0 bottom-0 z-30 border-sidebar-border border-t bg-sidebar pr-[var(--safe-area-right)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] [background-attachment:scroll] [background-position:left_bottom] md:hidden"
			>
				<div className="flex h-[var(--mobile-tabbar-height)] items-center justify-around">
					{tabs.map((tab) => {
						const isActive = tab.exact
							? location.pathname === tab.href
							: location.pathname.startsWith(tab.href);

						return (
							<Link
								key={tab.href}
								to={tab.href}
								data-pressable="subtle"
								aria-current={isActive ? "page" : undefined}
								onClick={(event) => {
									if (
										getMobileTabPressAction(location.pathname, tab.href) ===
										"reselect"
									) {
										event.preventDefault();
										onReselectActiveTab();
									}
								}}
								className={tabClass(isActive)}
							>
								<tab.icon
									aria-hidden="true"
									className="size-5"
									weight={isActive ? "fill" : "regular"}
								/>
								<span
									className={cn(
										"max-w-full truncate",
										isActive && "font-medium",
									)}
								>
									{tab.label()}
								</span>
							</Link>
						);
					})}

					<button
						type="button"
						data-pressable="subtle"
						onClick={() => setLibraryOpen(true)}
						aria-expanded={libraryOpen}
						aria-controls={LIBRARY_DRAWER_ID}
						className={tabClass(isLibraryActive)}
					>
						<Books
							aria-hidden="true"
							className="size-5"
							weight={isLibraryActive ? "fill" : "regular"}
						/>
						<span
							className={cn(
								"max-w-full truncate",
								isLibraryActive && "font-medium",
							)}
						>
							{m["nav.library"]()}
						</span>
					</button>

					{username ? (
						<Link
							to="/dashboard/user/$username"
							params={{ username }}
							{...profileTabProps}
						>
							{profileTabBody}
						</Link>
					) : (
						<Link to="/dashboard/profile" {...profileTabProps}>
							{profileTabBody}
						</Link>
					)}
				</div>
			</nav>

			<Drawer open={libraryOpen} onOpenChange={setLibraryOpen} showSwipeHandle>
				<DrawerContent
					id={LIBRARY_DRAWER_ID}
					className="[--drawer-content-max-height:calc(100dvh-var(--safe-area-top)-1rem)]"
				>
					<DrawerHeader className="px-4 pt-2 pb-1 text-left">
						<DrawerTitle className="text-sm tracking-wide">
							{m["nav.library"]()}
						</DrawerTitle>
						<DrawerDescription className="sr-only">
							{m["library.sheet_desc"]()}
						</DrawerDescription>
					</DrawerHeader>

					<nav className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain p-2 pb-[calc(0.5rem+var(--safe-area-bottom))]">
						<p className="px-3 py-1.5 font-medium text-muted-foreground text-xs">
							{m["nav.libraries"]()}
						</p>
						{libraries.isLoading ? (
							<div className="flex flex-col gap-2 px-3 py-2">
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
										data-pressable="subtle"
										onClick={() => setLibraryOpen(false)}
										className={drawerItemClass(isActive)}
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
						{catalogEntries.map((entry) => {
							const isActive = railSection === entry.section;

							return (
								<Link
									key={entry.section}
									to={entry.href}
									data-pressable="subtle"
									onClick={() => setLibraryOpen(false)}
									className={drawerItemClass(isActive)}
								>
									<entry.icon className="size-5" />
									<span>{entry.label()}</span>
								</Link>
							);
						})}
						{visibleBrowseItems.map((item) => {
							const isActive = location.pathname.startsWith(item.href);

							return (
								<Link
									key={item.href}
									to={item.href}
									data-pressable="subtle"
									onClick={() => setLibraryOpen(false)}
									className={drawerItemClass(isActive)}
								>
									<item.icon className="size-5" />
									<span>{item.label()}</span>
								</Link>
							);
						})}
					</nav>
				</DrawerContent>
			</Drawer>
		</>
	);
}
