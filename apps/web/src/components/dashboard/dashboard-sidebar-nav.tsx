import { Link } from "@tanstack/react-router";
import { Compass, Heart, Home, Library, Mic } from "lucide-react";
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
import { DashboardSidebarLibrary } from "./dashboard-sidebar-library";

const navButtonClass = cn(
	"h-11 gap-3.5 font-medium text-[15px]",
	"[&_svg]:size-4.5",
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

	const isSeriesActive = locationPathname.startsWith("/dashboard/series");
	const isNarratorsActive = locationPathname.startsWith("/dashboard/narrators");
	const isLikesActive = locationPathname.startsWith("/dashboard/likes");

	return (
		<SidebarContent>
			<SidebarGroup>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard"}
							tooltip="Home"
							className={navButtonClass}
							asChild
						>
							<Link to="/dashboard" preload="intent" onClick={handleNavigate}>
								<Home />
								<span>Home</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard/activity"}
							tooltip="Activity"
							className={navButtonClass}
							asChild
						>
							<Link
								to="/dashboard/activity"
								preload="intent"
								onClick={handleNavigate}
								aria-disabled={!online}
								tabIndex={online ? undefined : -1}
								className={cn(!online && offlineDisabledClass)}
							>
								<Compass />
								<span>Activity</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					{hasOrg && (
						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={isLikesActive}
								tooltip="Your Likes"
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
									<span>Your Likes</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarGroup>

			{hasOrg && (
				<>
					<SidebarGroup className="-mt-2 pt-0">
						<SidebarGroupLabel>Browse</SidebarGroupLabel>
						<SidebarMenu>
							{/* Single "Series" entry covers both ebook and audiobook series;
							    the /dashboard/series page is expected to gain All/Ebooks/
							    Audiobooks scope chips (separate handoff). */}
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isSeriesActive}
									tooltip="Series"
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
										<span>Series</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>

							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isNarratorsActive}
									tooltip="Narrators"
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
										<span>Narrators</span>
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
