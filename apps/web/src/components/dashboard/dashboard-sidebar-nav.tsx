import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ChevronRight,
	Compass,
	Folder,
	Headphones,
	Heart,
	Home,
	Library,
	Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

const navButtonClass = cn(
	"h-11 gap-3.5 rounded-lg px-3 font-medium text-[15px] text-sidebar-foreground/55",
	"[&_svg]:size-5",
	"hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
	"data-active:bg-transparent data-active:font-semibold data-active:text-sidebar-foreground",
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
	const { state, isMobile, setOpenMobile } = useSidebar();
	const handleNavigate = () => {
		if (isMobile) setOpenMobile(false);
		onNavigate();
	};
	const collapsed = state === "collapsed";
	const online = useOnlineStatus();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const hasOrg = !!activeOrg;

	const { data: collections, isLoading: isCollectionsLoading } = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: hasOrg,
	});

	const isCollectionsActive = locationPathname.startsWith(
		"/dashboard/collections",
	);
	const isSeriesActive = locationPathname.startsWith("/dashboard/series");
	const isAudiobookSeriesActive = locationPathname.startsWith(
		"/dashboard/audiobooks/series",
	);
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
									<Heart />
									<span>Your Likes</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarGroup>

			{hasOrg && (
				<SidebarGroup className="pt-0">
					<SidebarGroupLabel className="mt-2">Library</SidebarGroupLabel>
					<SidebarMenu>
						<Collapsible
							open={collapsed ? false : undefined}
							defaultOpen={isCollectionsActive}
						>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isCollectionsActive}
									tooltip="Collections"
									className={navButtonClass}
									asChild
								>
									<Link
										to="/dashboard/collections"
										preload="intent"
										onClick={handleNavigate}
										aria-disabled={!online}
										tabIndex={online ? undefined : -1}
										className={cn(!online && offlineDisabledClass)}
									>
										<Folder />
										<span>Collections</span>
									</Link>
								</SidebarMenuButton>
								<CollapsibleTrigger asChild>
									<Button
										variant="ghost"
										size="icon-xs"
										disabled={!online}
										className="absolute top-1/2 right-1.5 size-6 -translate-y-1/2 rounded-md text-sidebar-foreground/60 ring-sidebar-ring after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
									>
										<ChevronRight className="size-3.5 transition-transform duration-200 [[data-state=open]_&]:rotate-90" />
									</Button>
								</CollapsibleTrigger>

								<CollapsibleContent>
									<SidebarMenuSub>
										{isCollectionsLoading ? (
											<>
												<SidebarMenuSkeleton />
												<SidebarMenuSkeleton />
											</>
										) : collections && collections.length > 0 ? (
											collections.map((collection) => (
												<SidebarMenuSubItem key={collection.id}>
													<SidebarMenuSubButton
														isActive={locationPathname.startsWith(
															`/dashboard/collections/${collection.id}`,
														)}
														asChild
													>
														<Link
															to="/dashboard/collections/$collectionId"
															params={{
																collectionId: collection.id,
															}}
															onClick={handleNavigate}
														>
															<span>{collection.name}</span>
														</Link>
													</SidebarMenuSubButton>
												</SidebarMenuSubItem>
											))
										) : (
											<li className="px-2 py-1.5 text-sidebar-foreground/50 text-xs">
												No collections yet
											</li>
										)}
									</SidebarMenuSub>
								</CollapsibleContent>
							</SidebarMenuItem>
						</Collapsible>

						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={isSeriesActive}
								tooltip="Book Series"
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
									<span>Book Series</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>

						<SidebarMenuItem>
							<SidebarMenuButton
								isActive={isAudiobookSeriesActive}
								tooltip="Audiobook Series"
								className={navButtonClass}
								asChild
							>
								<Link
									to="/dashboard/audiobooks/series"
									preload="intent"
									onClick={handleNavigate}
									aria-disabled={!online}
									tabIndex={online ? undefined : -1}
									className={cn(!online && offlineDisabledClass)}
								>
									<Headphones />
									<span>Audiobook Series</span>
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
			)}
		</SidebarContent>
	);
}
