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
	MailOpen,
	Mic,
	Settings,
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
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

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
	const isNarratorsActive = locationPathname.startsWith(
		"/dashboard/narrators",
	);
	const isLikesActive = locationPathname.startsWith("/dashboard/likes");

	return (
		<SidebarContent>
			<SidebarGroup>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard"}
							tooltip="Home"
							asChild
						>
							<Link
								to="/dashboard"
								preload="intent"
								onClick={handleNavigate}
							>
								<Home />
								<span>Home</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard/activity"}
							tooltip="Activity"
							asChild
						>
							<Link
								to="/dashboard/activity"
								preload="intent"
								onClick={handleNavigate}
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
								asChild
							>
								<Link
									to="/dashboard/likes"
									preload="intent"
									onClick={handleNavigate}
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
									asChild
								>
									<Link
										to="/dashboard/collections"
										preload="intent"
										onClick={handleNavigate}
									>
										<Folder />
										<span>Collections</span>
									</Link>
								</SidebarMenuButton>
								<CollapsibleTrigger asChild>
									<Button
										variant="ghost"
										size="icon-xs"
										className="absolute top-[0.3125rem] right-1 size-6 rounded-md text-sidebar-foreground/70 ring-sidebar-ring after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
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
								asChild
							>
								<Link
									to="/dashboard/series"
									preload="intent"
									onClick={handleNavigate}
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
								asChild
							>
								<Link
									to="/dashboard/audiobooks/series"
									preload="intent"
									onClick={handleNavigate}
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
								asChild
							>
								<Link
									to="/dashboard/narrators"
									preload="intent"
									onClick={handleNavigate}
								>
									<Mic />
									<span>Narrators</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			)}

			<SidebarGroup className="pt-0">
				<SidebarGroupLabel className="mt-2">Preferences</SidebarGroupLabel>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={
								locationPathname.startsWith("/dashboard/settings") ||
								locationPathname.startsWith("/dashboard/admin")
							}
							tooltip="Settings"
							asChild
						>
							<Link
								to="/dashboard/settings"
								preload="intent"
								onClick={handleNavigate}
							>
								<Settings />
								<span>Settings</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={locationPathname === "/dashboard/invitations"}
							tooltip="Invitations"
							asChild
						>
							<Link
								to="/dashboard/invitations"
								preload="intent"
								onClick={handleNavigate}
							>
								<MailOpen />
								<span>Invitations</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroup>
		</SidebarContent>
	);
}
