import {
	Books,
	Buildings,
	Compass,
	DotsThree,
	Folder,
	Heart,
	House,
	Microphone,
	Tag,
	UserCircle,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { RailCreateMenu } from "@/components/dashboard/rail-create-menu";
import { UserMenu } from "@/components/dashboard/user-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardOrganization } from "@/functions/get-organizations";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

type NavIcon = ComponentType<{
	weight?: "fill" | "regular";
	className?: string;
}>;

interface RailItem {
	href:
		| "/dashboard"
		| "/dashboard/explore"
		| "/dashboard/likes"
		| "/dashboard/collections";
	label: () => string;
	icon: NavIcon;
	isActive: (pathname: string) => boolean;
	/** Catalog destinations need the network and an active server; home doesn't
	 *  — it has its own offline view. */
	needsCatalog?: boolean;
	activeIconClassName?: string;
}

interface MoreItem {
	href:
		| "/dashboard/authors"
		| "/dashboard/series"
		| "/dashboard/narrators"
		| "/dashboard/genres"
		| "/dashboard/publishers";
	label: () => string;
	icon: NavIcon;
}

// Explore covers the category page itself plus everything reached from it:
// the unified catalog and the per-library catalogs.
const isBrowseActive = (pathname: string) =>
	pathname === "/dashboard/explore" ||
	pathname === "/dashboard/books" ||
	pathname === "/dashboard/audiobooks" ||
	pathname.startsWith("/dashboard/libraries/");

const prefixMatch = (href: string) => (pathname: string) =>
	pathname.startsWith(href);

// Home leads the rail: it's the first thing you come back to, so it sits at the
// top of the one chrome column instead of off in the top bar.
const railItems: RailItem[] = [
	{
		href: "/dashboard",
		label: m["nav.home"],
		icon: House,
		isActive: (pathname) => pathname === "/dashboard",
	},
	{
		href: "/dashboard/explore",
		label: m["nav.browse"],
		icon: Compass,
		isActive: isBrowseActive,
		needsCatalog: true,
	},
	{
		href: "/dashboard/likes",
		label: m["nav.your_likes"],
		icon: Heart,
		isActive: prefixMatch("/dashboard/likes"),
		needsCatalog: true,
		activeIconClassName: "text-destructive",
	},
	{
		href: "/dashboard/collections",
		label: m["nav.collections"],
		icon: Folder,
		isActive: prefixMatch("/dashboard/collections"),
		needsCatalog: true,
	},
];

// The catalog facets: browsed occasionally, so they sit one level down under
// "More" instead of each taking a permanent slot in the rail. A single "Series"
// entry covers both ebook and audiobook series; the page scopes by format via
// ?format=audiobooks.
const moreItems: MoreItem[] = [
	{ href: "/dashboard/authors", label: m["nav.authors"], icon: UserCircle },
	{ href: "/dashboard/series", label: m["nav.series"], icon: Books },
	{ href: "/dashboard/narrators", label: m["nav.narrators"], icon: Microphone },
	{ href: "/dashboard/genres", label: m["nav.genres"], icon: Tag },
	{
		href: "/dashboard/publishers",
		label: m["nav.publishers"],
		icon: Buildings,
	},
];

const blockClass = (active: boolean, disabled: boolean) =>
	cn(
		"group/rail flex w-full shrink-0 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] leading-tight",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
		active ? "text-sidebar-foreground" : "text-muted-foreground",
		disabled && "pointer-events-none opacity-40",
	);

/** Chip + label. Only the chip carries the active fill, so a long label never
 *  stretches the highlight. */
function BlockBody({
	icon: Icon,
	label,
	active,
	activeIconClassName,
}: {
	icon: NavIcon;
	label: string;
	active: boolean;
	activeIconClassName?: string;
}): ReactNode {
	return (
		<>
			<span
				className={cn(
					"grid size-9 place-items-center rounded-lg transition-colors duration-150 ease-out-quart",
					active
						? "bg-sidebar-accent/80"
						: "group-hover/rail:bg-sidebar-accent/60 group-aria-expanded/rail:bg-sidebar-accent/60",
				)}
			>
				<Icon
					weight={active ? "fill" : "regular"}
					className={cn("size-5", active && activeIconClassName)}
				/>
			</span>
			<span className="max-w-full truncate font-medium">{label}</span>
		</>
	);
}

/**
 * The app rail — the only chrome column. Server badge over the primary
 * destinations, each an icon above its label, closing with a "More" menu for
 * the catalog facets. It doesn't collapse; the list scrolls on short windows
 * rather than compressing the blocks.
 */
export function DashboardAppRail({
	locationPathname,
	organizations,
	activeOrganizationId,
}: {
	locationPathname: string;
	organizations: DashboardOrganization[];
	activeOrganizationId: string | null;
}) {
	const online = useOnlineStatus();
	const catalogDisabled = !online || !activeOrganizationId;
	const moreActive = moreItems.some((item) =>
		locationPathname.startsWith(item.href),
	);

	return (
		<nav
			aria-label={m["nav.menu"]()}
			// Sized for the longest label we ship at 10px ("Colecciones"); a longer
			// locale still truncates, so every block carries a title as the escape.
			className="hidden w-[5.5rem] shrink-0 flex-col items-center px-2 md:flex"
		>
			<div className="flex h-14 shrink-0 items-center">
				<OrgSwitcher
					variant="rail"
					initialOrganizations={organizations}
					activeOrganizationId={activeOrganizationId}
				/>
			</div>

			<div className="no-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain pb-2">
				{railItems.map((item) => {
					const active = item.isActive(locationPathname);
					const disabled = item.needsCatalog ? catalogDisabled : false;
					const label = item.label();
					return (
						<Link
							key={item.href}
							to={item.href}
							preload="intent"
							// Link's own prefix matching would call "/dashboard" current on
							// every dashboard route, and would miss the routes Explore
							// covers. Exact matching silences it so isActive — the same
							// thing that drives the highlight — owns aria-current.
							activeOptions={{ exact: true }}
							aria-current={active ? "page" : undefined}
							aria-disabled={disabled}
							tabIndex={disabled ? -1 : undefined}
							title={label}
							className={blockClass(active, disabled)}
						>
							<BlockBody
								icon={item.icon}
								label={label}
								active={active}
								activeIconClassName={item.activeIconClassName}
							/>
						</Link>
					);
				})}

				<DropdownMenu>
					<DropdownMenuTrigger
						type="button"
						disabled={catalogDisabled}
						title={m["nav.more"]()}
						className={blockClass(moreActive, catalogDisabled)}
					>
						<BlockBody
							icon={DotsThree}
							label={m["nav.more"]()}
							active={moreActive}
						/>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						side="right"
						align="end"
						sideOffset={8}
						className="w-auto min-w-52"
					>
						{moreItems.map((item) => (
							<DropdownMenuItem key={item.href} asChild>
								<Link to={item.href} preload="intent" className="gap-2.5">
									<item.icon
										weight={
											locationPathname.startsWith(item.href)
												? "fill"
												: "regular"
										}
									/>
									<span className="flex-1">{item.label()}</span>
								</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Account sits at the foot of the rail, away from the destinations —
			    it's where you leave the app, not a place you go. The create menu
			    shares that foot: it makes things, it doesn't navigate. */}
			<div className="flex w-full shrink-0 flex-col items-center gap-2 pt-1 pb-3">
				<RailCreateMenu />
				<UserMenu collapsed side="right" align="end" />
			</div>
		</nav>
	);
}
