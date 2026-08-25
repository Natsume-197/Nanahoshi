import {
	BookOpen,
	BookOpenText,
	Books,
	Buildings,
	DotsThree,
	Folder,
	Headphones,
	House,
	Microphone,
	Tag,
	UserCircle,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ComponentType, Fragment, type ReactNode } from "react";
import {
	type RailSection,
	resolveRailSection,
} from "@/components/dashboard/rail-nav";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useWindowEvent } from "@/hooks/use-window-event";
import { toggleRail, useRailState } from "@/lib/rail-store";
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
		| "/dashboard/books"
		| "/dashboard/audiobooks"
		| "/dashboard/read-listen"
		| "/dashboard/collections"
		| "/dashboard/series"
		| "/dashboard/genres";
	label: () => string;
	icon: NavIcon;
	section: Exclude<RailSection, null | "more">;
	/** Catalog destinations need the network and an active server; home doesn't
	 *  — it has its own offline view. */
	needsCatalog?: boolean;
}

interface MoreItem {
	href: "/dashboard/authors" | "/dashboard/narrators" | "/dashboard/publishers";
	label: () => string;
	icon: NavIcon;
}

interface RailGroup {
	/** Home stands alone above the first heading. */
	label?: () => string;
	items: RailItem[];
}

/** Grouped, not flat: the formats you read, the axes you browse by, then the
 *  people and imprints credited on a book. */
const railGroups: RailGroup[] = [
	{
		items: [
			{
				href: "/dashboard",
				label: m["nav.home"],
				icon: House,
				section: "home",
			},
		],
	},
	{
		label: m["nav.library"],
		items: [
			{
				href: "/dashboard/books",
				label: m["nav.books"],
				icon: BookOpen,
				section: "books",
				needsCatalog: true,
			},
			{
				href: "/dashboard/audiobooks",
				label: m["nav.audiobooks"],
				icon: Headphones,
				section: "audiobooks",
				needsCatalog: true,
			},
			{
				href: "/dashboard/read-listen",
				label: m["nav.read_listen"],
				icon: BookOpenText,
				section: "read-listen",
				needsCatalog: true,
			},
		],
	},
	{
		label: m["nav.browse"],
		items: [
			{
				href: "/dashboard/collections",
				label: m["nav.collections"],
				icon: Folder,
				section: "collections",
				needsCatalog: true,
			},
			// A single "Series" entry covers both ebook and audiobook series; the
			// page scopes by format via ?format=audiobooks.
			{
				href: "/dashboard/series",
				label: m["nav.series"],
				icon: Books,
				section: "series",
				needsCatalog: true,
			},
			{
				href: "/dashboard/genres",
				label: m["nav.genres"],
				icon: Tag,
				section: "genres",
				needsCatalog: true,
			},
		],
	},
];

/** Tail of the Browse group: three more axes than the collapsed rail has room
 *  for, so they hide behind a "More" menu and only lay out flat once the rail
 *  is expanded. */
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
		"rail-expanded:flex-row rail-expanded:gap-3 rail-expanded:py-2.5 rail-expanded:ps-[calc(var(--rail-item-inset)-0.20rem)] rail-expanded:pe-2 rail-expanded:text-sm",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		// --nav-inactive, not --muted-foreground: a step below the current
		// destination that still clears AA at this size. See index.css.
		active ? "text-sidebar-foreground" : "text-nav-inactive",
		// Expanded, the icon plate goes transparent, so the current destination
		// needs the row itself to carry the fill the plate carries collapsed.
		active
			? "rail-expanded:bg-sidebar-accent/80 rail-expanded:font-semibold"
			: "rail-expanded:hover:bg-sidebar-accent/40 rail-expanded:hover:text-sidebar-foreground rail-expanded:aria-expanded:bg-sidebar-accent/40",
		disabled && "pointer-events-none opacity-40",
	);

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
					"grid rail-expanded:size-6 size-9 shrink-0 place-items-center rounded-lg transition-colors duration-150 ease-out-quart",
					active
						? "bg-sidebar-accent/80 rail-expanded:bg-transparent"
						: "group-hover/rail:bg-sidebar-accent/60 rail-expanded:group-hover/rail:bg-transparent group-aria-expanded/rail:bg-sidebar-accent/60 rail-expanded:group-aria-expanded/rail:bg-transparent",
				)}
			>
				<Icon
					aria-hidden="true"
					weight={active ? "fill" : "regular"}
					className="rail-expanded:size-6 size-5"
				/>
			</span>
			<span className="rail-expanded:min-w-0 max-w-full rail-expanded:flex-1 rail-expanded:truncate text-center rail-expanded:text-start font-medium leading-tight">
				{label}
			</span>
		</>
	);
}

function RailGroup({ children }: { children: ReactNode }): ReactNode {
	return (
		<div className="rail-expanded:flex hidden w-full flex-col gap-0.5">
			{children}
		</div>
	);
}

/** Expanded only: at 5.5rem a heading would wrap worse than the destinations
 *  it introduces, and the collapsed rail is short enough to read unbroken. */
function RailGroupHeading({ label }: { label: string }): ReactNode {
	return (
		<h2 className="rail-expanded:block hidden w-full shrink-0 ps-[calc(var(--rail-item-inset)-0.5rem)] pt-4 pb-1 font-medium text-nav-inactive text-xs uppercase tracking-wide">
			{label}
		</h2>
	);
}

export function DashboardAppRail({
	locationPathname,
	activeOrganizationId,
}: {
	locationPathname: string;
	activeOrganizationId: string | null;
}) {
	const online = useOnlineStatus();
	const catalogDisabled = !online || !activeOrganizationId;
	const section = resolveRailSection(locationPathname);
	const moreActive = section === "more";
	const expanded = useRailState() === "expanded";

	useWindowEvent("keydown", (event) => {
		if (
			(event.key === "b" || event.key === "B") &&
			(event.metaKey || event.ctrlKey)
		) {
			event.preventDefault();
			toggleRail();
		}
	});

	return (
		<nav
			aria-label={m["nav.menu"]()}
			// Labels wrap to keep localized destinations fully visible; every block
			// also carries a title as an additional escape for narrow rail space.
			className="theme-gradient-surface relative hidden w-[var(--rail-width)] shrink-0 flex-col items-center bg-sidebar px-2 motion-safe:transition-[width] motion-safe:duration-[220ms] motion-safe:ease-out-quart md:flex"
		>
			<div
				data-rail-content
				className="no-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain pt-0 pb-2"
			>
				{railGroups.map((group) => (
					<Fragment key={group.items[0].section}>
						{group.label && <RailGroupHeading label={group.label()} />}
						{group.items.map((item) => {
							const active = item.section === section;
							const disabled = item.needsCatalog ? catalogDisabled : false;
							const label = item.label();
							return (
								<Link
									key={item.section}
									to={item.href}
									preload="intent"
									// Link's own prefix matching would call "/dashboard" current
									// on every dashboard route. Exact matching silences it so
									// resolveRailSection owns aria-current.
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
					</Fragment>
				))}

				<div className="contents rail-expanded:hidden">
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

				<RailGroup>
					{moreItems.map((item) => {
						const active = locationPathname.startsWith(item.href);
						const label = item.label();
						return (
							<Link
								key={item.href}
								to={item.href}
								preload="intent"
								aria-current={active ? "page" : undefined}
								aria-disabled={catalogDisabled}
								tabIndex={catalogDisabled ? -1 : undefined}
								title={label}
								className={blockClass(active, catalogDisabled)}
							>
								<BlockBody icon={item.icon} label={label} active={active} />
							</Link>
						);
					})}
				</RailGroup>
			</div>

			<button
				type="button"
				onClick={toggleRail}
				aria-expanded={expanded}
				aria-label={m["aria.toggle_sidebar"]()}
				title={m["aria.toggle_sidebar"]()}
				className="group/rail-toggle absolute inset-y-0 end-[-0.5rem] z-30 w-4 cursor-pointer touch-manipulation bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
			>
				<span className="pointer-events-none absolute inset-y-1/2 start-1/2 flex h-9 w-2 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 border-sidebar-border/70 border-x opacity-0 transition-opacity duration-150 ease-out-quart group-hover/rail-toggle:opacity-100 group-focus-visible/rail-toggle:opacity-100">
					<span className="size-px rounded-full bg-sidebar-foreground/50" />
					<span className="size-px rounded-full bg-sidebar-foreground/50" />
					<span className="size-px rounded-full bg-sidebar-foreground/50" />
				</span>
			</button>
		</nav>
	);
}
