import {
	Books,
	Buildings,
	Compass,
	Heart,
	House,
	Microphone,
	Tag,
	UserCircle,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import {
	SidebarContent,
	SidebarGroup,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { DashboardSidebarCollections } from "./dashboard-sidebar-collections";

const navButtonClass = cn(
	"h-10 gap-3 rounded-lg px-3 font-medium text-sm",
	"[&_svg]:size-5",
);

const offlineDisabledClass = "pointer-events-none opacity-40";

interface DashboardSidebarNavProps {
	locationPathname: string;
	onNavigate: () => void;
	hasOrganization: boolean;
}

export function DashboardSidebarNav({
	locationPathname,
	onNavigate,
	hasOrganization,
}: DashboardSidebarNavProps) {
	const { isMobile, setOpenMobile } = useSidebar();
	const handleNavigate = () => {
		if (isMobile) setOpenMobile(false);
		onNavigate();
	};
	const online = useOnlineStatus();
	const { data: activeOrg, isPending: isActiveOrgPending } =
		authClient.useActiveOrganization();
	const hasOrg = isActiveOrgPending ? hasOrganization : !!activeOrg;
	const catalogDisabled = !online || !hasOrg;

	const isLikesActive = locationPathname.startsWith("/dashboard/likes");
	// Explore covers the category page itself plus everything reached from it:
	// the unified catalog and the per-library catalogs.
	const isBrowseActive =
		locationPathname === "/dashboard/explore" ||
		locationPathname === "/dashboard/books" ||
		locationPathname === "/dashboard/audiobooks" ||
		locationPathname.startsWith("/dashboard/libraries/");

	// Flat catalog rows (no group label), mirroring the reference's plain
	// icon+label list. Likes leads, like "Liked songs".
	const catalogItems = [
		{
			href: "/dashboard/authors" as const,
			label: m["nav.authors"],
			icon: UserCircle,
		},
		// Single "Series" entry covers both ebook and audiobook series;
		// the page scopes by format via ?format=audiobooks.
		{
			href: "/dashboard/series" as const,
			label: m["nav.series"],
			icon: Books,
		},
		{
			href: "/dashboard/narrators" as const,
			label: m["nav.narrators"],
			icon: Microphone,
		},
		{ href: "/dashboard/genres" as const, label: m["nav.genres"], icon: Tag },
		{
			href: "/dashboard/publishers" as const,
			label: m["nav.publishers"],
			icon: Buildings,
		},
	];

	return (
		<SidebarContent>
			{/* pt-0 lines the first row up with the content panel's top border. */}
			<SidebarGroup className="pt-0">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard"}
							tooltip={m["nav.home"]()}
							className={navButtonClass}
							asChild
						>
							<Link
								to="/dashboard"
								preload="intent"
								onClick={handleNavigate}
								aria-disabled={!online}
								tabIndex={online ? undefined : -1}
								className={cn(!online && offlineDisabledClass)}
							>
								<House
									weight={
										locationPathname === "/dashboard" ? "fill" : "regular"
									}
								/>
								<span>{m["nav.home"]()}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={isBrowseActive}
							tooltip={m["nav.browse"]()}
							className={navButtonClass}
							asChild
						>
							<Link
								to="/dashboard/explore"
								preload="intent"
								onClick={handleNavigate}
								aria-disabled={catalogDisabled}
								tabIndex={catalogDisabled ? -1 : undefined}
								className={cn(catalogDisabled && offlineDisabledClass)}
							>
								<Compass weight={isBrowseActive ? "fill" : "regular"} />
								<span>{m["nav.browse"]()}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={isLikesActive}
							tooltip={m["nav.your_likes"]()}
							className={navButtonClass}
							asChild
						>
							<Link
								to="/dashboard/likes"
								preload="intent"
								onClick={handleNavigate}
								aria-disabled={catalogDisabled}
								tabIndex={catalogDisabled ? -1 : undefined}
								className={cn(catalogDisabled && offlineDisabledClass)}
							>
								<Heart
									weight={isLikesActive ? "fill" : "regular"}
									className={cn(isLikesActive && "text-destructive")}
								/>
								<span>{m["nav.your_likes"]()}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					{catalogItems.map((item) => {
						const isActive = locationPathname.startsWith(item.href);
						return (
							<SidebarMenuItem key={item.href}>
								<SidebarMenuButton
									isActive={isActive}
									tooltip={item.label()}
									className={navButtonClass}
									asChild
								>
									<Link
										to={item.href}
										preload="intent"
										onClick={handleNavigate}
										aria-disabled={catalogDisabled}
										tabIndex={catalogDisabled ? -1 : undefined}
										className={cn(catalogDisabled && offlineDisabledClass)}
									>
										<item.icon weight={isActive ? "fill" : "regular"} />
										<span>{item.label()}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroup>

			{hasOrg ? (
				<DashboardSidebarCollections
					locationPathname={locationPathname}
					onNavigate={handleNavigate}
				/>
			) : null}
		</SidebarContent>
	);
}
