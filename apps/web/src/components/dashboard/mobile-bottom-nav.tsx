import { cn } from "@nanahoshi/ui/lib/utils";
import {
	Books,
	Folder,
	House,
	MagnifyingGlass,
	User,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
	getMobileTabPressAction,
	getProfileTabPath,
} from "@/components/dashboard/mobile-tab-navigation";
import { resolveRailSection } from "@/components/dashboard/rail-nav";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useSession } from "@/hooks/use-session";
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

const LIBRARY_PATH = "/dashboard/library";

// Everything reached from the Library screen keeps its tab lit, as the
// sidebar's Browse group does on desktop.
const LIBRARY_SECTIONS = new Set([
	"catalog",
	"read-listen",
	"stats",
	"series",
	"authors",
	"narrators",
	"genres",
	"publishers",
]);

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
	const { data: session } = useSession();
	// Resolved (per-active-org) avatar; falls back to the global account image.
	const { data: profile } = useQuery({
		...orpc.profile.getProfile.queryOptions(),
		enabled: !!session,
	});
	const avatarImage =
		(profile?.image as string | null | undefined) ?? session?.user.image;
	const railSection = resolveRailSection(location.pathname);

	const isLibraryActive =
		location.pathname === LIBRARY_PATH ||
		(railSection !== null && LIBRARY_SECTIONS.has(railSection)) ||
		location.pathname.startsWith("/dashboard/libraries");

	// The tab goes straight to the profile page — no intermediate sheet. Account
	// actions (status, settings, sign out) live in that page's own
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
								className={cn("max-w-full truncate", isActive && "font-medium")}
							>
								{tab.label()}
							</span>
						</Link>
					);
				})}

				<Link
					to={LIBRARY_PATH}
					data-pressable="subtle"
					aria-current={isLibraryActive ? "page" : undefined}
					onClick={(event) => {
						if (
							getMobileTabPressAction(location.pathname, LIBRARY_PATH) ===
							"reselect"
						) {
							event.preventDefault();
							onReselectActiveTab();
						}
					}}
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
				</Link>

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
	);
}
