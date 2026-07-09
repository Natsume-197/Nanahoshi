import {
	Books,
	Buildings,
	Compass,
	Heart,
	House,
	Microphone,
	Tag,
	User,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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
import { orpc } from "@/utils/orpc";
import { DashboardSidebarLibrary } from "./dashboard-sidebar-library";

const navButtonClass = cn(
	"h-10 gap-3 rounded-lg font-medium text-sm",
	"[&_svg]:size-[18px]",
);

const offlineDisabledClass = "pointer-events-none opacity-40";

interface DashboardSidebarNavProps {
	locationPathname: string;
	onNavigate: () => void;
}

export function DashboardSidebarNav({
	locationPathname,
	onNavigate,
}: DashboardSidebarNavProps) {
	const { isMobile, setOpenMobile } = useSidebar();
	const handleNavigate = () => {
		if (isMobile) setOpenMobile(false);
		onNavigate();
	};
	const online = useOnlineStatus();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const hasOrg = !!activeOrg;

	const isNarratorsActive = locationPathname.startsWith("/dashboard/narrators");
	const isLikesActive = locationPathname.startsWith("/dashboard/likes");
	const isBrowseActive =
		locationPathname === "/dashboard/books" ||
		locationPathname === "/dashboard/audiobooks";

	// Narrators only exist for audiobooks; hide the entry on servers without any
	// (kept visible while on the page itself so the nav doesn't lose its anchor).
	const { data: narratorCount } = useQuery({
		...orpc.narrators.count.queryOptions(),
		staleTime: 300_000,
		enabled: hasOrg,
	});
	const showNarrators = (narratorCount ?? 0) > 0 || isNarratorsActive;

	// Flat catalog rows (no group label), mirroring the reference's plain
	// icon+label list. Likes leads, like "Liked songs".
	const catalogItems = [
		{
			href: "/dashboard/authors" as const,
			label: m["nav.authors"],
			icon: User,
		},
		// Single "Series" entry covers both ebook and audiobook series;
		// the page scopes by format via ?format=audiobooks.
		{ href: "/dashboard/series" as const, label: m["nav.series"], icon: Books },
		...(showNarrators
			? [
					{
						href: "/dashboard/narrators" as const,
						label: m["nav.narrators"],
						icon: Microphone,
					},
				]
			: []),
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

					{hasOrg && (
						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={isBrowseActive}
								tooltip={m["nav.browse"]()}
								className={navButtonClass}
								asChild
							>
								{/* The all-items catalog (books; audiobooks is its format twin). */}
								<Link
									to="/dashboard/books"
									preload="intent"
									onClick={handleNavigate}
									aria-disabled={!online}
									tabIndex={online ? undefined : -1}
									className={cn(!online && offlineDisabledClass)}
								>
									<Compass weight={isBrowseActive ? "fill" : "regular"} />
									<span>{m["nav.browse"]()}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}

					{hasOrg && (
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
									aria-disabled={!online}
									tabIndex={online ? undefined : -1}
									className={cn(!online && offlineDisabledClass)}
								>
									<Heart
										weight={isLikesActive ? "fill" : "regular"}
										className={cn(isLikesActive && "text-destructive")}
									/>
									<span>{m["nav.your_likes"]()}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}

					{hasOrg &&
						catalogItems.map((item) => {
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
											aria-disabled={!online}
											tabIndex={online ? undefined : -1}
											className={cn(!online && offlineDisabledClass)}
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

			{hasOrg && (
				<DashboardSidebarLibrary
					locationPathname={locationPathname}
					onNavigate={handleNavigate}
				/>
			)}
		</SidebarContent>
	);
}
