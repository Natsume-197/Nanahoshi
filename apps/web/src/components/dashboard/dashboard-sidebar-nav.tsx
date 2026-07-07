import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, Heart, Home, Library, Mic, Tags, User } from "lucide-react";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
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

const navButtonClass = cn("h-9 gap-3 font-medium text-sm", "[&_svg]:size-4");

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

	const isAuthorsActive = locationPathname.startsWith("/dashboard/authors");
	const isSeriesActive = locationPathname.startsWith("/dashboard/series");
	const isNarratorsActive = locationPathname.startsWith("/dashboard/narrators");

	// Narrators only exist for audiobooks; hide the entry on servers without any
	// (kept visible while on the page itself so the nav doesn't lose its anchor).
	const { data: narratorCount } = useQuery({
		...orpc.narrators.count.queryOptions(),
		staleTime: 300_000,
		enabled: hasOrg,
	});
	const showNarrators = (narratorCount ?? 0) > 0 || isNarratorsActive;
	const isGenresActive = locationPathname.startsWith("/dashboard/genres");
	const isPublishersActive = locationPathname.startsWith(
		"/dashboard/publishers",
	);
	const isLikesActive = locationPathname.startsWith("/dashboard/likes");

	return (
		<SidebarContent>
			<SidebarGroup>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard"}
							tooltip={m["nav.home"]()}
							className={navButtonClass}
							asChild
						>
							<Link to="/dashboard" preload="intent" onClick={handleNavigate}>
								<Home />
								<span>{m["nav.home"]()}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

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
										className={cn(
											isLikesActive && "fill-current text-destructive",
										)}
									/>
									<span>{m["nav.your_likes"]()}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarGroup>

			{hasOrg && (
				<>
					<SidebarGroup className="-mt-2 pt-0">
						<SidebarGroupLabel>{m["nav.browse"]()}</SidebarGroupLabel>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isAuthorsActive}
									tooltip={m["nav.authors"]()}
									className={navButtonClass}
									asChild
								>
									<Link
										to="/dashboard/authors"
										preload="intent"
										onClick={handleNavigate}
										aria-disabled={!online}
										tabIndex={online ? undefined : -1}
										className={cn(!online && offlineDisabledClass)}
									>
										<User />
										<span>{m["nav.authors"]()}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>

							{/* Single "Series" entry covers both ebook and audiobook series;
							    the page scopes by format via ?format=audiobooks. */}
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isSeriesActive}
									tooltip={m["nav.series"]()}
									className={navButtonClass}
									asChild
								>
									<Link
										to="/dashboard/series"
										preload="intent"
										onClick={handleNavigate}
										aria-disabled={!online}
										tabIndex={online ? undefined : -1}
										className={cn(!online && offlineDisabledClass)}
									>
										<Library />
										<span>{m["nav.series"]()}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>

							{showNarrators && (
								<SidebarMenuItem>
									<SidebarMenuButton
										isActive={isNarratorsActive}
										tooltip={m["nav.narrators"]()}
										className={navButtonClass}
										asChild
									>
										<Link
											to="/dashboard/narrators"
											preload="intent"
											onClick={handleNavigate}
											aria-disabled={!online}
											tabIndex={online ? undefined : -1}
											className={cn(!online && offlineDisabledClass)}
										>
											<Mic />
											<span>{m["nav.narrators"]()}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							)}

							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isGenresActive}
									tooltip={m["nav.genres"]()}
									className={navButtonClass}
									asChild
								>
									<Link
										to="/dashboard/genres"
										preload="intent"
										onClick={handleNavigate}
										aria-disabled={!online}
										tabIndex={online ? undefined : -1}
										className={cn(!online && offlineDisabledClass)}
									>
										<Tags />
										<span>{m["nav.genres"]()}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>

							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isPublishersActive}
									tooltip={m["nav.publishers"]()}
									className={navButtonClass}
									asChild
								>
									<Link
										to="/dashboard/publishers"
										preload="intent"
										onClick={handleNavigate}
										aria-disabled={!online}
										tabIndex={online ? undefined : -1}
										className={cn(!online && offlineDisabledClass)}
									>
										<Building2 />
										<span>{m["nav.publishers"]()}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroup>

					<DashboardSidebarLibrary
						locationPathname={locationPathname}
						onNavigate={handleNavigate}
					/>
				</>
			)}
		</SidebarContent>
	);
}
