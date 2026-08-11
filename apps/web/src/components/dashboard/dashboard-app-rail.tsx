import {
	Books,
	Buildings,
	Compass,
	DotsThree,
	Folder,
	House,
	Microphone,
	Tag,
	UserCircle,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

type NavIcon = ComponentType<{
	weight?: "fill" | "regular";
	className?: string;
	"aria-hidden"?: "true";
}>;

interface RailItem {
	href:
		| "/dashboard"
		| "/dashboard/explore"
		| "/dashboard/collections"
		| "/dashboard/series"
		| "/dashboard/genres";
	label: () => string;
	icon: NavIcon;
	isActive: (pathname: string) => boolean;
	/** Catalog destinations need the network and an active server; home doesn't
	 *  — it has its own offline view. */
	needsCatalog?: boolean;
}

interface MoreItem {
	href: "/dashboard/authors" | "/dashboard/narrators" | "/dashboard/publishers";
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
//
// The rail carries shared surfaces — the catalog and collections, which are
// public entities. Private per-user lists (shelves, likes) live on the profile
// instead, so "mine" isn't split across two places.
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
		href: "/dashboard/collections",
		label: m["nav.collections"],
		icon: Folder,
		isActive: prefixMatch("/dashboard/collections"),
		needsCatalog: true,
	},
	// A single "Series" entry covers both ebook and audiobook series; the page
	// scopes by format via ?format=audiobooks.
	{
		href: "/dashboard/series",
		label: m["nav.series"],
		icon: Books,
		isActive: prefixMatch("/dashboard/series"),
		needsCatalog: true,
	},
	{
		href: "/dashboard/genres",
		label: m["nav.genres"],
		icon: Tag,
		isActive: prefixMatch("/dashboard/genres"),
		needsCatalog: true,
	},
];

// The catalog facets browsed occasionally, so they sit one level down under
// "More" instead of each taking a permanent slot in the rail.
const moreItems: MoreItem[] = [
	{ href: "/dashboard/authors", label: m["nav.authors"], icon: UserCircle },
	{ href: "/dashboard/narrators", label: m["nav.narrators"], icon: Microphone },
	{
		href: "/dashboard/publishers",
		label: m["nav.publishers"],
		icon: Buildings,
	},
];

const blockClass = (active: boolean, disabled: boolean) =>
	cn(
		"group/rail flex w-full shrink-0 flex-col items-center gap-0.5 rounded-lg py-1 text-xs leading-tight",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		// --nav-inactive, not --muted-foreground: a step below the current
		// destination that still clears AA at this size. See index.css.
		active ? "text-sidebar-foreground" : "text-nav-inactive",
		disabled && "pointer-events-none opacity-40",
	);

/** Chip + label. Only the chip carries the active fill, so a long label never
 *  stretches the highlight. */
function BlockBody({
	icon: Icon,
	label,
	active,
}: {
	icon: NavIcon;
	label: string;
	active: boolean;
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
					aria-hidden="true"
					weight={active ? "fill" : "regular"}
					className="size-5"
				/>
			</span>
			<span className="max-w-full truncate font-medium">{label}</span>
		</>
	);
}

/**
 * The app rail — the navigation chrome column. The primary destinations, each
 * an icon above its label, closing with a "More" menu for the catalog facets.
 * It doesn't collapse; the list scrolls on short windows rather than
 * compressing the blocks. (Server switching and account actions live in the
 * top bar.)
 */
export function DashboardAppRail({
	locationPathname,
	activeOrganizationId,
}: {
	locationPathname: string;
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
			className="hidden w-[5.5rem] shrink-0 flex-col items-center rounded-tr-2xl bg-background px-2 md:flex"
		>
			<div className="no-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain py-2">
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
							<BlockBody icon={item.icon} label={label} active={active} />
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
		</nav>
	);
}
