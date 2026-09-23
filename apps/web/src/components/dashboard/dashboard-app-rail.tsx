import {
	BookOpen,
	BookOpenText,
	Books,
	Buildings,
	Headphones,
	House,
	Microphone,
	Tag,
	UserCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ComponentType, Fragment, type ReactNode } from "react";
import { MyLibrarySection } from "@/components/dashboard/my-library-section";
import {
	type RailSection,
	resolveRailSection,
} from "@/components/dashboard/rail-nav";
import { RailSectionTitle } from "@/components/dashboard/rail-section";
import { ReadListenIcon } from "@/components/read-listen/read-listen-icon";
import { useWindowEvent } from "@/hooks/use-window-event";
import { toggleRail } from "@/lib/rail-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

type NavIcon = ComponentType<{
	weight?: "bold" | "fill" | "regular";
	className?: string;
	"aria-hidden"?: "true";
}>;

interface RailItem {
	href:
		| "/dashboard"
		| "/dashboard/books"
		| "/dashboard/read-listen"
		| "/dashboard/series"
		| "/dashboard/genres"
		| "/dashboard/authors"
		| "/dashboard/narrators"
		| "/dashboard/publishers";
	label: () => string;
	icon: NavIcon;
	activeWeight?: "bold" | "fill";
	section: Exclude<RailSection, null>;
	/** Catalog destinations require an active server. */
	needsCatalog?: boolean;
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
		items: [
			{
				href: "/dashboard/books",
				label: m["nav.catalog"],
				icon: BookOpenText,
				section: "catalog",
				needsCatalog: true,
			},
			{
				href: "/dashboard/read-listen",
				label: m["nav.read_listen"],
				icon: ReadListenIcon,
				activeWeight: "bold",
				section: "read-listen",
				needsCatalog: true,
			},
		],
	},
	{
		label: m["nav.browse"],
		items: [
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
			{
				href: "/dashboard/authors",
				label: m["nav.authors"],
				icon: UserCircle,
				section: "authors",
				needsCatalog: true,
			},
			{
				href: "/dashboard/narrators",
				label: m["nav.narrators"],
				icon: Microphone,
				section: "narrators",
				needsCatalog: true,
			},
			{
				href: "/dashboard/publishers",
				label: m["nav.publishers"],
				icon: Buildings,
				section: "publishers",
				needsCatalog: true,
			},
		],
	},
];

const blockClass = (active: boolean, disabled: boolean) =>
	cn(
		"group/rail flex w-full shrink-0 flex-col items-center gap-0.5 rounded-lg py-1 text-xs leading-tight",
		"rail-expanded:flex-row rail-expanded:gap-3 rail-expanded:py-2 rail-expanded:ps-[var(--rail-row-inset)] rail-expanded:pe-2 rail-expanded:text-[15px]",
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
	activeWeight = "fill",
}: {
	icon: NavIcon;
	label: string;
	active: boolean;
	activeWeight?: "bold" | "fill";
}): ReactNode {
	return (
		<>
			<span
				className={cn(
					"grid size-9 rail-expanded:h-6 rail-expanded:w-11 shrink-0 place-items-center rounded-lg transition-colors duration-150 ease-out-quart",
					active
						? "bg-transparent"
						: "group-hover/rail:bg-sidebar-accent/60 rail-expanded:group-hover/rail:bg-transparent group-aria-expanded/rail:bg-sidebar-accent/60 rail-expanded:group-aria-expanded/rail:bg-transparent",
				)}
			>
				<Icon
					aria-hidden="true"
					weight={active ? activeWeight : "regular"}
					className="rail-expanded:size-[22px] size-5"
				/>
			</span>
			<span className="rail-expanded:min-w-0 max-w-full rail-expanded:flex-1 rail-expanded:truncate text-center rail-expanded:text-start font-medium leading-tight">
				{label}
			</span>
		</>
	);
}

export function DashboardAppRail({
	locationPathname,
	activeOrganizationId,
}: {
	locationPathname: string;
	activeOrganizationId: string | null;
}) {
	const catalogDisabled = !activeOrganizationId;
	const section = resolveRailSection(locationPathname);
	const { data: libraries } = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		staleTime: 30_000,
		enabled: Boolean(activeOrganizationId),
	});

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
			className="theme-gradient-surface relative hidden w-[var(--rail-width)] shrink-0 flex-col items-center bg-sidebar motion-safe:transition-[width] motion-safe:duration-[220ms] motion-safe:ease-out-quart md:flex"
		>
			<div
				data-rail-content
				// Padding lives on the scroller so the scrollbar sits at the window edge.
				className="scrollbar-hover flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain px-2 rail-expanded:pe-1 pt-0 pb-2 rail-expanded:[scrollbar-gutter:stable]"
			>
				{railGroups.map((group) => (
					<Fragment key={group.items[0].section}>
						{group.label && <RailSectionTitle label={group.label()} />}
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
									<BlockBody
										icon={item.icon}
										label={label}
										active={active}
										activeWeight={item.activeWeight ?? "fill"}
									/>
								</Link>
							);
						})}
					</Fragment>
				))}

				{/* Your libraries sit just above your collections: both are "yours",
				    the browse axes above them span the whole catalog. */}
				{libraries?.length ? (
					<>
						<RailSectionTitle label={m["nav.libraries"]()} />
						{libraries.map((library) => {
							const active = locationPathname.startsWith(
								`/dashboard/libraries/${library.uuid}`,
							);
							const label = library.name ?? m["library.untitled"]();
							const Icon =
								library.mediaType === "audiobook" ? Headphones : BookOpen;

							return (
								<Link
									key={library.uuid}
									to="/dashboard/libraries/$uuid"
									params={{ uuid: library.uuid }}
									preload="intent"
									aria-current={active ? "page" : undefined}
									aria-disabled={catalogDisabled}
									tabIndex={catalogDisabled ? -1 : undefined}
									title={label}
									className={blockClass(active, catalogDisabled)}
								>
									<BlockBody icon={Icon} label={label} active={active} />
								</Link>
							);
						})}
					</>
				) : null}

				{!catalogDisabled && (
					<MyLibrarySection locationPathname={locationPathname} />
				)}
			</div>
		</nav>
	);
}
